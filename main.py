"""
Murf AI Voice Agent - Day 15: WebSocket Integration
A sophisticated AI-powered conversational agent with real-time WebSocket communication.
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
    version="2.0.0 (Day 15)"
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize services
websocket_manager = WebSocketManager()
stt_service = STTService()
tts_service = TTSService()
llm_service = LLMService()

# Session storage (in production, use Redis or database)
sessions: Dict[str, List[ChatMessage]] = {}

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
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            logger.info(f"Received WebSocket message: {message_data.get('type', 'unknown')}")
            
            # Handle different message types
            await handle_websocket_message(websocket, message_data)
            
    except WebSocketDisconnect:
        logger.info("WebSocket connection closed")
        if session_id:
            await websocket_manager.send_to_session(session_id, {
                "type": "user_disconnected",
                "session_id": session_id
            })
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await websocket_manager.send_error(websocket, str(e))
    finally:
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

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
