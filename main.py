"""
Murf AI Voice Agent - Day 17: Real-Time Audio Transcription
A sophisticated AI-powered conversational agent with real-time WebSocket audio streaming and transcription.
"""

import os
import uuid
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
import uvicorn

from services.websocket_manager import WebSocketManager
from services.stt_service import STTService
from services.streaming_stt_service import StreamingSTTService
from services.tts_service import TTSService
from services.llm_service import LLMService
from models.message_models import (
    ChatMessage, 
    WebSocketMessage, 
    SessionInfo,
    ErrorResponse
)

# Load environment variables
load_dotenv(".env")

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Murf AI Voice Agent",
    description="AI-powered conversational agent with WebSocket support",
    version="2.2.0 (Day 17)"
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize services
websocket_manager = WebSocketManager()
stt_service = STTService()
streaming_stt_service = StreamingSTTService()
tts_service = TTSService()
llm_service = LLMService()

# Session storage (in production, use Redis or database)
sessions: Dict[str, List[ChatMessage]] = {}

# Audio streaming sessions
streaming_sessions: Dict[str, dict] = {}

# Transcription streaming sessions
transcription_sessions: Dict[str, dict] = {}

@app.get("/", response_class=HTMLResponse)
async def get_homepage():
    """Serve the main HTML page"""
    try:
        with open("static/index.html", "r") as f:
            return f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Frontend not found")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "stt": stt_service.is_healthy(),
            "streaming_stt": streaming_stt_service.is_healthy(),
            "tts": tts_service.is_healthy(),
            "llm": llm_service.is_healthy()
        }
    }

@app.get("/test/murf")
async def test_murf_connection():
    """Test Murf AI connection and configuration"""
    try:
        connection_status = await tts_service.check_murf_api_connection()
        return {
            "service": "Murf AI TTS",
            "timestamp": datetime.utcnow().isoformat(),
            **connection_status
        }
    except Exception as e:
        logger.error(f"Error testing Murf connection: {str(e)}")
        return {
            "service": "Murf AI TTS",
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

@app.get("/session/new")
async def create_session():
    """Create a new session"""
    session_id = str(uuid.uuid4())
    sessions[session_id] = []
    logger.info(f"Created new session: {session_id}")
    return SessionInfo(session_id=session_id, message_count=0)

@app.get("/session/{session_id}/history")
async def get_session_history(session_id: str):
    """Get chat history for a session"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "session_id": session_id,
        "messages": sessions[session_id],
        "message_count": len(sessions[session_id])
    }

@app.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and its history"""
    if session_id in sessions:
        del sessions[session_id]
        logger.info(f"Deleted session: {session_id}")
        return {"message": "Session deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Session not found")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for real-time voice agent communication
    Day 15 Feature: Real-time bidirectional communication
    Day 16 Feature: Real-time audio streaming
    """
    session_id = None
    try:
        await websocket_manager.connect(websocket)
        logger.info("WebSocket connection established")
        
        # Send welcome message
        await websocket_manager.send_message(websocket, {
            "type": "connection",
            "message": "Connected to Murf AI Voice Agent",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        while True:
            # Receive message (could be text or binary)
            message = await websocket.receive()
            
            if message['type'] == 'websocket.receive':
                if message.get('text') is not None:
                    # Handle text message
                    try:
                        message_data = json.loads(message['text'])
                        logger.info(f"Received WebSocket message: {message_data.get('type', 'unknown')}")
                        await handle_websocket_message(websocket, message_data)
                    except json.JSONDecodeError as e:
                        logger.error(f"Invalid JSON received: {e}")
                        await websocket_manager.send_error(websocket, "Invalid JSON format")
                        
                elif message.get('bytes') is not None:
                    # Handle binary audio data
                    binary_data = message['bytes']
                    logger.debug(f"Received binary audio data: {len(binary_data)} bytes")
                    await handle_audio_stream(websocket, binary_data)
            
    except WebSocketDisconnect:
        logger.info("WebSocket connection closed")
        # Safely determine session_id from connection metadata
        conn_info = websocket_manager.get_connection_info(websocket) or {}
        session_id = conn_info.get("session_id")
        if session_id:
            await websocket_manager.send_to_session(session_id, {
                "type": "user_disconnected",
                "session_id": session_id
            })
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))
    finally:
        # Cleanup streaming sessions for this websocket
        sessions_to_remove = []
        for sid, session in streaming_sessions.items():
            if session["websocket"] == websocket:
                sessions_to_remove.append(sid)
                # Close file handle if still open
                try:
                    if session.get("file_handle"):
                        session["file_handle"].close()
                    logger.info(f"Closed streaming session {sid} on disconnect")
                except:
                    pass
        
        for sid in sessions_to_remove:
            del streaming_sessions[sid]
        
        # Cleanup transcription sessions for this websocket
        transcription_sessions_to_remove = []
        for sid, session in transcription_sessions.items():
            if session["websocket"] == websocket:
                transcription_sessions_to_remove.append(sid)
                # Stop transcription service
                try:
                    await streaming_stt_service.stop_streaming_session(sid)
                    logger.info(f"Stopped transcription session {sid} on disconnect")
                except:
                    pass
        
        for sid in transcription_sessions_to_remove:
            del transcription_sessions[sid]
            
        websocket_manager.disconnect(websocket)

async def handle_websocket_message(websocket: WebSocket, message_data: dict):
    """Handle different types of WebSocket messages"""
    message_type = message_data.get("type")
    
    try:
        if message_type == "session_create":
            session_id = str(uuid.uuid4())
            sessions[session_id] = []
            await websocket_manager.send_message(websocket, {
                "type": "session_created",
                "session_id": session_id,
                "message": "New session created successfully"
            })
            websocket_manager.add_to_session(websocket, session_id)
            
        elif message_type == "session_join":
            session_id = message_data.get("session_id")
            if session_id not in sessions:
                sessions[session_id] = []
            
            await websocket_manager.send_message(websocket, {
                "type": "session_joined",
                "session_id": session_id,
                "history": sessions[session_id],
                "message": f"Joined session {session_id}"
            })
            websocket_manager.add_to_session(websocket, session_id)
            
        elif message_type == "echo":
            # Simple echo for testing (Day 15 requirement)
            await websocket_manager.send_message(websocket, {
                "type": "echo_response",
                "original_message": message_data.get("message", ""),
                "timestamp": datetime.utcnow().isoformat()
            })
            
        elif message_type == "voice_message":
            await process_voice_message(websocket, message_data)
            
        elif message_type == "text_message":
            await process_text_message(websocket, message_data)
            
        elif message_type == "start_streaming":
            await start_audio_streaming(websocket, message_data)
            
        elif message_type == "stop_streaming":
            await stop_audio_streaming(websocket, message_data)
            
        elif message_type == "start_transcription":
            await start_streaming_transcription(websocket, message_data)
            
        elif message_type == "stop_transcription":
            await stop_streaming_transcription(websocket, message_data)
            
        else:
            await websocket_manager.send_error(websocket, f"Unknown message type: {message_type}")
            
    except Exception as e:
        logger.error(f"Error handling message type {message_type}: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))

async def process_voice_message(websocket: WebSocket, message_data: dict):
    """Process voice message through the AI pipeline"""
    session_id = message_data.get("session_id")
    audio_data = message_data.get("audio_data")  # Base64 encoded audio
    
    if not session_id or not audio_data:
        await websocket_manager.send_error(websocket, "Missing session_id or audio_data")
        return
    
    try:
        # Update client on processing status
        await websocket_manager.send_message(websocket, {
            "type": "processing_status",
            "stage": "transcription",
            "message": "Converting speech to text..."
        })
        
        # Speech-to-Text
        transcript = await stt_service.transcribe_audio_base64(audio_data)
        
        if not transcript:
            await websocket_manager.send_error(websocket, "Could not transcribe audio")
            return
        
        await websocket_manager.send_message(websocket, {
            "type": "transcription_complete",
            "transcript": transcript
        })
        
        # Process as text message
        await process_ai_response(websocket, session_id, transcript)
        
    except Exception as e:
        logger.error(f"Error processing voice message: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))

async def process_text_message(websocket: WebSocket, message_data: dict):
    """Process text message through the AI pipeline"""
    session_id = message_data.get("session_id")
    text = message_data.get("text")
    
    if not session_id or not text:
        await websocket_manager.send_error(websocket, "Missing session_id or text")
        return
    
    await process_ai_response(websocket, session_id, text)

async def process_ai_response(websocket: WebSocket, session_id: str, user_input: str):
    """Process user input through LLM and generate voice response"""
    try:
        # Ensure session exists
        if session_id not in sessions:
            sessions[session_id] = []
        
        # Add user message to history
        user_message = ChatMessage(
            role="user",
            content=user_input,
            timestamp=datetime.utcnow()
        )
        sessions[session_id].append(user_message)
        
        # Update client
        await websocket_manager.send_message(websocket, {
            "type": "processing_status",
            "stage": "thinking",
            "message": "AI is thinking..."
        })
        
        # Get AI response
        chat_history = [{"role": msg.role, "content": msg.content} for msg in sessions[session_id]]
        ai_response = await llm_service.get_response(user_input, chat_history)
        
        # Add AI response to history
        ai_message = ChatMessage(
            role="assistant",
            content=ai_response,
            timestamp=datetime.utcnow()
        )
        sessions[session_id].append(ai_message)
        
        # Send text response
        await websocket_manager.send_message(websocket, {
            "type": "ai_response",
            "text": ai_response,
            "session_id": session_id
        })
        
        # Generate voice response
        await websocket_manager.send_message(websocket, {
            "type": "processing_status",
            "stage": "voice_generation",
            "message": "Generating voice response..."
        })
        
        audio_url = await tts_service.generate_speech(ai_response)
        
        await websocket_manager.send_message(websocket, {
            "type": "voice_response",
            "audio_url": audio_url,
            "text": ai_response,
            "session_id": session_id
        })
        
    except Exception as e:
        logger.error(f"Error processing AI response: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))

async def start_audio_streaming(websocket: WebSocket, message_data: dict):
    """Initialize audio streaming session"""
    try:
        session_id = message_data.get("session_id")
        if not session_id:
            await websocket_manager.send_error(websocket, "Session ID required for streaming")
            return
        
        # Determine streaming data format (webm or pcm16)
        data_format = message_data.get("data_format", "webm")
        
        # Create audio file path (only for webm; pcm16 not persisted by default)
        import os
        os.makedirs("recordings", exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"recordings/stream_{session_id}_{timestamp}.{ 'webm' if data_format == 'webm' else 'wav' }"
        
        # Initialize streaming session
        streaming_sessions[session_id] = {
            "websocket": websocket,
            "filename": filename,
            # Only write to file for webm format; pcm16 is forwarded to STT only
            "file_handle": open(filename, "wb") if data_format == "webm" else None,
            "start_time": datetime.utcnow(),
            "chunk_count": 0,
            "total_bytes": 0,
            "data_format": data_format
        }
        
        logger.info(f"Started audio streaming for session {session_id} -> {filename}")
        
        await websocket_manager.send_message(websocket, {
            "type": "streaming_started",
            "session_id": session_id,
            "filename": filename,
            "message": "Audio streaming started"
        })
        
    except Exception as e:
        logger.error(f"Error starting audio streaming: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))

async def stop_audio_streaming(websocket: WebSocket, message_data: dict):
    """Stop audio streaming and finalize file"""
    try:
        session_id = message_data.get("session_id")
        if not session_id or session_id not in streaming_sessions:
            await websocket_manager.send_error(websocket, "No active streaming session found")
            return
        
        session = streaming_sessions[session_id]
        
        # Close file handle if present
        if session.get("file_handle"):
            session["file_handle"].close()
        
        # Calculate session stats
        duration = datetime.utcnow() - session["start_time"]
        stats = {
            "filename": session["filename"],
            "duration_seconds": duration.total_seconds(),
            "total_chunks": session["chunk_count"],
            "total_bytes": session["total_bytes"],
            "avg_chunk_size": session["total_bytes"] / max(session["chunk_count"], 1)
        }
        
        logger.info(f"Stopped audio streaming for session {session_id}: {stats}")
        
        # Remove from active sessions
        del streaming_sessions[session_id]
        
        await websocket_manager.send_message(websocket, {
            "type": "streaming_stopped",
            "session_id": session_id,
            "stats": stats,
            "message": f"Audio saved to {stats['filename']}"
        })
        
    except Exception as e:
        logger.error(f"Error stopping audio streaming: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))

async def handle_audio_stream(websocket: WebSocket, audio_data: bytes):
    """Handle incoming streaming audio data"""
    try:
        # Find the streaming session for this websocket
        session_id = None
        for sid, session in streaming_sessions.items():
            if session["websocket"] == websocket:
                session_id = sid
                break
        
        if not session_id:
            logger.warning("Received audio data but no active streaming session found")
            return
        
        session = streaming_sessions[session_id]
        
        # Write audio data to file only for webm format
        if session.get("data_format") == "webm" and session.get("file_handle"):
            session["file_handle"].write(audio_data)
            session["file_handle"].flush()  # Ensure data is written
        
        # Update session stats
        session["chunk_count"] += 1
        session["total_bytes"] += len(audio_data)
        
        # Stream audio to transcription service if transcription is active and data is PCM16
        if session_id in transcription_sessions and session.get("data_format") == "pcm16":
            await streaming_stt_service.stream_audio_chunk(session_id, audio_data)
        
        # Send progress update every 10 chunks
        if session["chunk_count"] % 10 == 0:
            await websocket_manager.send_message(websocket, {
                "type": "streaming_progress",
                "session_id": session_id,
                "chunk_count": session["chunk_count"],
                "total_bytes": session["total_bytes"],
                "chunk_size": len(audio_data)
            })
        
        logger.debug(f"Received audio chunk {session['chunk_count']}: {len(audio_data)} bytes")
        
    except Exception as e:
        logger.error(f"Error handling audio stream: {str(e)}")
        # Don't send error message here to avoid disrupting the stream

async def start_streaming_transcription(websocket: WebSocket, message_data: dict):
    """Start real-time transcription for streaming audio"""
    try:
        session_id = message_data.get("session_id")
        if not session_id:
            await websocket_manager.send_error(websocket, "Session ID required for transcription")
            return
        
        # Define callbacks for transcription events
        async def on_partial_transcript(data):
            """Handle partial transcription results"""
            await websocket_manager.send_message(websocket, {
                "type": "partial_transcript",
                "session_id": data["session_id"],
                "text": data["text"],
                "confidence": data["confidence"],
                "timestamp": data["timestamp"]
            })
        
        async def on_final_transcript(data):
            """Handle final transcription results"""
            await websocket_manager.send_message(websocket, {
                "type": "final_transcript",
                "session_id": data["session_id"],
                "text": data["text"],
                "confidence": data["confidence"],
                "timestamp": data["timestamp"]
            })
        
        async def on_turn_detected(data):
            """Handle turn detection events"""
            await websocket_manager.send_message(websocket, {
                "type": "turn_detected",
                "session_id": data["session_id"],
                "text": data.get("text", ""),
                "timestamp": data["timestamp"]
            })
        
        async def on_transcription_error(data):
            """Handle transcription errors"""
            await websocket_manager.send_message(websocket, {
                "type": "transcription_error",
                "session_id": data["session_id"],
                "error": data["error"],
                "timestamp": data["timestamp"]
            })
        
        # Start streaming transcription session
        success = await streaming_stt_service.start_streaming_session(
            session_id=session_id,
            on_partial_transcript=on_partial_transcript,
            on_final_transcript=on_final_transcript,
            on_error=on_transcription_error,
            on_turn_detected=on_turn_detected
        )
        
        if success:
            # Store transcription session
            transcription_sessions[session_id] = {
                "websocket": websocket,
                "started_at": datetime.utcnow()
            }
            
            logger.info(f"Started streaming transcription for session: {session_id}")
            
            await websocket_manager.send_message(websocket, {
                "type": "transcription_started",
                "session_id": session_id,
                "message": "Real-time transcription started"
            })
        else:
            await websocket_manager.send_error(websocket, "Failed to start transcription service")
        
    except Exception as e:
        logger.error(f"Error starting streaming transcription: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))

async def stop_streaming_transcription(websocket: WebSocket, message_data: dict):
    """Stop real-time transcription"""
    try:
        session_id = message_data.get("session_id")
        if not session_id:
            await websocket_manager.send_error(websocket, "Session ID required")
            return
        
        # Stop transcription service
        summary = await streaming_stt_service.stop_streaming_session(session_id)
        
        # Remove from active sessions
        if session_id in transcription_sessions:
            del transcription_sessions[session_id]
        
        logger.info(f"Stopped streaming transcription for session: {session_id}")
        
        await websocket_manager.send_message(websocket, {
            "type": "transcription_stopped",
            "session_id": session_id,
            "summary": summary,
            "message": "Real-time transcription stopped"
        })
        
    except Exception as e:
        logger.error(f"Error stopping streaming transcription: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
