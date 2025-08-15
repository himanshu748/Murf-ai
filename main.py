"""
Murf AI Conversational Bot - FastAPI Application
Days 10-14 Complete Implementation with Refactored Architecture
"""

import os
import sys
import logging
import time
import uuid
import tempfile
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

# FastAPI and related imports
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import ValidationError

# Environment and configuration
from dotenv import load_dotenv

# Import our services and models
from services import STTService, TTSService, LLMService
from models import (
    ConversationResponse, TTSResponse, STTResponse, LLMResponse,
    HealthResponse, ErrorResponse, ChatHistory, ChatMessage
)

# Rate limiting and caching
from collections import defaultdict
import json
import asyncio

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv('LOG_LEVEL', 'INFO')),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('murf_ai_bot.log')
    ]
)
logger = logging.getLogger(__name__)

# Application startup time
app_start_time = time.time()

# In-memory session storage (Day 10 requirement - can be replaced with Redis/DB for production)
chat_sessions: Dict[str, ChatHistory] = {}
session_lock = {}  # Simple locking mechanism

# Application lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    logger.info("🚀 Starting Murf AI Conversational Bot")
    
    # Initialize services
    try:
        app.state.stt_service = STTService()
        app.state.tts_service = TTSService()
        app.state.llm_service = LLMService()
        logger.info("✅ All services initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        raise
    
    # Create uploads directory
    uploads_dir = os.getenv('UPLOAD_FOLDER', 'uploads')
    os.makedirs(uploads_dir, exist_ok=True)
    logger.info(f"📁 Uploads directory ready: {uploads_dir}")
    
    yield
    
    logger.info("🛑 Shutting down Murf AI Conversational Bot")

# Create FastAPI application
app = FastAPI(
    title="🎤 Murf AI Conversational Bot",
    description="Advanced AI-powered voice conversation system with memory and context",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS
allowed_origins = os.getenv('ALLOWED_ORIGINS', 'http://localhost:8000,http://127.0.0.1:8000,http://0.0.0.0:8000').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if os.getenv('ENVIRONMENT', 'development') == 'development' else allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Add trusted host middleware (disabled for local development)
# app.add_middleware(
#     TrustedHostMiddleware,
#     allowed_hosts=["localhost", "127.0.0.1", "0.0.0.0", "*.localhost", "*.ngrok.io"]  # Add your production domains
# )

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler with logging"""
    logger.error(f"Unhandled exception on {request.url}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            message="Internal server error occurred",
            error_code="INTERNAL_ERROR",
            details={"path": str(request.url)}
        ).dict()
    )

# Dependency for service access
def get_services(request: Request):
    """Dependency to get initialized services"""
    return {
        'stt': request.app.state.stt_service,
        'tts': request.app.state.tts_service,
        'llm': request.app.state.llm_service
    }

# Utility functions for session management
def get_or_create_session(session_id: str) -> ChatHistory:
    """Get existing session or create new one"""
    if session_id not in chat_sessions:
        chat_sessions[session_id] = ChatHistory(
            session_id=session_id,
            messages=[],
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        logger.info(f"📝 Created new chat session: {session_id}")
    
    return chat_sessions[session_id]

def update_session(session_id: str, user_message: str, ai_response: str):
    """Update session with new messages"""
    session = get_or_create_session(session_id)
    
    # Add user message
    session.messages.append(ChatMessage(
        role="user",
        content=user_message,
        timestamp=datetime.now()
    ))
    
    # Add AI response
    session.messages.append(ChatMessage(
        role="assistant", 
        content=ai_response,
        timestamp=datetime.now()
    ))
    
    # Update session timestamp
    session.updated_at = datetime.now()
    
    # Limit session history (prevent memory issues)
    max_history = int(os.getenv('MAX_CHAT_HISTORY', 10))
    if len(session.messages) > max_history * 2:  # *2 because we store both user and AI messages
        session.messages = session.messages[-(max_history * 2):]
        logger.info(f"🗃️ Trimmed session history for {session_id}")

def get_chat_history_for_llm(session_id: str) -> List[Dict[str, str]]:
    """Format chat history for LLM consumption"""
    if session_id not in chat_sessions:
        return []
    
    session = chat_sessions[session_id]
    formatted_history = []
    
    for message in session.messages[-20:]:  # Last 20 messages
        formatted_history.append({
            'role': message.role,
            'content': message.content
        })
    
    return formatted_history

# ROUTES

# Main page
@app.get("/")
async def serve_main_page():
    """Serve the main HTML page"""
    return FileResponse("static/index.html")

# Voice mode page
@app.get("/voice")
async def serve_voice_page():
    """Serve the clean voice mode page"""
    return FileResponse("static/voice.html")

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check(services: dict = Depends(get_services)):
    """Health check endpoint"""
    try:
        # Check service statuses
        stt_status = services['stt'].get_service_status()
        tts_status = services['tts'].get_service_status()
        llm_status = services['llm'].get_service_status()
        
        service_statuses = {
            'stt': stt_status['status'],
            'tts': tts_status['status'], 
            'llm': llm_status['status']
        }
        
        # Determine overall health
        all_active = all(status == 'active' for status in service_statuses.values())
        overall_status = 'healthy' if all_active else 'degraded'
        
        return HealthResponse(
            status=overall_status,
            services=service_statuses,
            version="1.0.0"
        )
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status='unhealthy',
            services={'error': str(e)},
            version="1.0.0"
        )

# Day 10-14 Main Endpoint: Conversational Chat with Memory
@app.post("/agent/chat/{session_id}", response_model=ConversationResponse)
async def conversational_chat(
    session_id: str,
    audio: UploadFile = File(...),
    services: dict = Depends(get_services)
):
    """
    Main conversational endpoint with session-based memory (Days 10-14)
    
    Process: Audio -> STT -> Chat History -> LLM -> Update History -> TTS -> Audio Response
    """
    start_time = time.time()
    logger.info(f"🎯 Starting conversation for session: {session_id}")
    
    try:
        # Validate audio file
        if not audio.content_type or not audio.content_type.startswith('audio/'):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Please upload an audio file."
            )
        
        # Read audio data
        audio_data = await audio.read()
        if len(audio_data) == 0:
            raise HTTPException(
                status_code=400, 
                detail="Empty audio file received."
            )
        
        logger.info(f"📄 Received audio file: {audio.filename}, size: {len(audio_data)} bytes")
        
        # Step 1: Speech-to-Text
        logger.info("🎤 Starting speech-to-text transcription...")
        stt_result = await services['stt'].transcribe_audio(audio_data, audio.filename)
        
        if not stt_result['success']:
            logger.error(f"STT failed: {stt_result.get('error', 'Unknown error')}")
            return ConversationResponse(
                success=False,
                error=f"Speech transcription failed: {stt_result.get('error')}",
                session_id=session_id,
                message_count=len(get_or_create_session(session_id).messages),
                processing_time=time.time() - start_time
            )
        
        transcript = stt_result['transcript']
        if not transcript.strip():
            return ConversationResponse(
                success=False,
                error="No speech detected in audio. Please try again.",
                session_id=session_id,
                message_count=len(get_or_create_session(session_id).messages),
                processing_time=time.time() - start_time
            )
        
        logger.info(f"✅ STT successful: '{transcript[:100]}{'...' if len(transcript) > 100 else ''}'")
        
        # Step 2: Get chat history and generate LLM response
        logger.info("🧠 Generating LLM response with context...")
        chat_history = get_chat_history_for_llm(session_id)
        llm_result = await services['llm'].generate_response(transcript, chat_history)
        
        if not llm_result['success']:
            logger.error(f"LLM failed: {llm_result.get('error', 'Unknown error')}")
            # Use fallback response but continue processing
            ai_response = llm_result.get('response', llm_result.get('fallback_message', 
                "I'm having trouble processing your request right now."))
        else:
            ai_response = services['llm'].optimize_for_voice(llm_result['response'])
        
        logger.info(f"✅ LLM response: '{ai_response[:100]}{'...' if len(ai_response) > 100 else ''}'")
        
        # Step 3: Update chat history
        logger.info("💾 Updating chat session history...")
        update_session(session_id, transcript, ai_response)
        current_session = get_or_create_session(session_id)
        
        # Step 4: Text-to-Speech
        logger.info("🔊 Generating TTS audio response...")
        processed_text = services['tts'].preprocess_text(ai_response)
        tts_result = await services['tts'].generate_speech(processed_text)
        
        if not tts_result['success']:
            logger.error(f"TTS failed: {tts_result.get('error', 'Unknown error')}")
            # Return response without audio
            return ConversationResponse(
                success=True,
                transcript=transcript,
                response=ai_response,
                audio_url=None,
                session_id=session_id,
                message_count=len(current_session.messages),
                error=f"Text-to-speech failed: {tts_result.get('error')}",
                processing_time=time.time() - start_time
            )
        
        # Success response
        processing_time = time.time() - start_time
        logger.info(f"🎉 Conversation completed successfully in {processing_time:.2f}s")
        
        return ConversationResponse(
            success=True,
            transcript=transcript,
            response=ai_response,
            audio_url=tts_result.get('audio_url'),
            session_id=session_id,
            message_count=len(current_session.messages),
            processing_time=processing_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Conversation processing failed: {str(e)}", exc_info=True)
        return ConversationResponse(
            success=False,
            error=f"Processing failed: {str(e)}",
            session_id=session_id,
            message_count=len(get_or_create_session(session_id).messages),
            processing_time=time.time() - start_time
        )

# Get chat history for debugging/analysis
@app.get("/agent/history/{session_id}")
async def get_chat_history(session_id: str):
    """Retrieve chat history for a session"""
    try:
        if session_id not in chat_sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = chat_sessions[session_id]
        return {
            "success": True,
            "session_id": session_id,
            "message_count": len(session.messages),
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "messages": [
                {
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat()
                }
                for msg in session.messages
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve chat history")

# Clear chat history
@app.delete("/agent/history/{session_id}")
async def clear_chat_history(session_id: str):
    """Clear chat history for a session"""
    try:
        if session_id in chat_sessions:
            del chat_sessions[session_id]
            logger.info(f"🗑️ Cleared chat history for session: {session_id}")
        
        return {"success": True, "message": "Chat history cleared"}
    except Exception as e:
        logger.error(f"Failed to clear history: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear chat history")

# Legacy endpoints for backward compatibility (Days 1-9)

@app.post("/generate", response_model=TTSResponse)
async def generate_tts(
    text: str,
    voice_id: Optional[str] = None,
    services: dict = Depends(get_services)
):
    """Generate TTS audio from text (Day 2 legacy endpoint)"""
    try:
        if not text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        result = await services['tts'].generate_speech(text, voice_id)
        
        return TTSResponse(
            success=result['success'],
            audio_url=result.get('audio_url'),
            voice_id=result.get('voice_id'),
            error=result.get('error'),
            fallback_message=result.get('fallback_message')
        )
        
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        return TTSResponse(
            success=False,
            error=str(e),
            fallback_message="Speech generation failed"
        )

@app.post("/transcribe/file", response_model=STTResponse)
async def transcribe_file(
    audio: UploadFile = File(...),
    services: dict = Depends(get_services)
):
    """Transcribe uploaded audio file (Day 6 legacy endpoint)"""
    try:
        audio_data = await audio.read()
        result = await services['stt'].transcribe_audio(audio_data, audio.filename)
        
        return STTResponse(
            success=result['success'],
            transcript=result.get('transcript', ''),
            confidence=result.get('confidence'),
            language_code=result.get('language_code'),
            error=result.get('error')
        )
        
    except Exception as e:
        logger.error(f"STT transcription failed: {e}")
        return STTResponse(
            success=False,
            transcript='',
            error=str(e)
        )

@app.post("/llm/query", response_model=LLMResponse)
async def query_llm(
    message: str,
    session_id: Optional[str] = None,
    services: dict = Depends(get_services)
):
    """Query LLM with optional chat history (Day 8-9 legacy endpoint)"""
    try:
        chat_history = get_chat_history_for_llm(session_id) if session_id else None
        result = await services['llm'].generate_response(message, chat_history)
        
        return LLMResponse(
            success=result['success'],
            response=result.get('response', ''),
            model=result.get('model'),
            tokens_used=result.get('tokens_used'),
            error=result.get('error')
        )
        
    except Exception as e:
        logger.error(f"LLM query failed: {e}")
        return LLMResponse(
            success=False,
            response='',
            error=str(e)
        )

# Voice selection and configuration endpoints
@app.get("/voices")
async def get_available_voices(services: dict = Depends(get_services)):
    """Get list of available TTS voices with details"""
    try:
        voices = await services['tts'].get_available_voices()
        return {
            "success": True,
            "voices": voices,
            "default_voice": services['tts'].get_default_voice()
        }
    except Exception as e:
        logger.error(f"Failed to get voices: {e}")
        return {
            "success": False,
            "error": str(e),
            "voices": [],
            "default_voice": None
        }

@app.post("/voices/preview")
async def preview_voice(
    text: str = "Hello, this is a preview of this voice.",
    voice_id: str = None,
    services: dict = Depends(get_services)
):
    """Generate a preview of a specific voice"""
    try:
        if not voice_id:
            voice_id = services['tts'].get_default_voice()
        
        result = await services['tts'].generate_speech(text, voice_id)
        return {
            "success": result['success'],
            "audio_url": result.get('audio_url'),
            "voice_id": voice_id,
            "preview_text": text,
            "error": result.get('error')
        }
    except Exception as e:
        logger.error(f"Voice preview failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# Enhanced debugging and monitoring endpoints
@app.get("/debug/session/{session_id}")
async def debug_session(session_id: str):
    """Get detailed debug information for a session"""
    try:
        if session_id not in chat_sessions:
            return {
                "success": False,
                "error": "Session not found",
                "session_exists": False
            }
        
        session = chat_sessions[session_id]
        return {
            "success": True,
            "session_id": session_id,
            "session_exists": True,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "message_count": len(session.messages),
            "session_age_minutes": (datetime.now() - session.created_at).total_seconds() / 60,
            "last_activity_minutes": (datetime.now() - session.updated_at).total_seconds() / 60,
            "recent_messages": [
                {
                    "role": msg.role,
                    "content": msg.content[:100] + ("..." if len(msg.content) > 100 else ""),
                    "timestamp": msg.timestamp.isoformat(),
                    "message_length": len(msg.content)
                }
                for msg in session.messages[-5:]  # Last 5 messages
            ]
        }
    except Exception as e:
        logger.error(f"Debug session failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "session_exists": False
        }

@app.get("/debug/logs")
async def get_recent_logs():
    """Get recent application logs for debugging"""
    try:
        log_file = 'murf_ai_bot.log'
        if not os.path.exists(log_file):
            return {
                "success": False,
                "error": "Log file not found"
            }
        
        # Read last 50 lines of the log file
        with open(log_file, 'r') as f:
            lines = f.readlines()
            recent_lines = lines[-50:] if len(lines) > 50 else lines
        
        return {
            "success": True,
            "log_lines": [line.strip() for line in recent_lines],
            "total_lines": len(lines),
            "showing_last": len(recent_lines)
        }
    except Exception as e:
        logger.error(f"Failed to read logs: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# Service status endpoints
@app.get("/status")
async def get_system_status(services: dict = Depends(get_services)):
    """Get detailed system and service status"""
    try:
        uptime = time.time() - app_start_time
        
        return {
            "system": {
                "status": "operational",
                "uptime_seconds": uptime,
                "uptime_formatted": str(timedelta(seconds=int(uptime))),
                "version": "1.0.0",
                "timestamp": datetime.now().isoformat()
            },
            "services": {
                "stt": services['stt'].get_service_status(),
                "tts": services['tts'].get_service_status(),
                "llm": services['llm'].get_service_status()
            },
            "sessions": {
                "active_sessions": len(chat_sessions),
                "total_messages": sum(len(session.messages) for session in chat_sessions.values())
            }
        }
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        raise HTTPException(status_code=500, detail="Status check failed")

# Cleanup endpoint for development
@app.post("/admin/cleanup")
async def cleanup_sessions():
    """Clean up old sessions (development/admin endpoint)"""
    try:
        cutoff_time = datetime.now() - timedelta(hours=24)
        old_sessions = [
            session_id for session_id, session in chat_sessions.items()
            if session.updated_at < cutoff_time
        ]
        
        for session_id in old_sessions:
            del chat_sessions[session_id]
        
        logger.info(f"🧹 Cleaned up {len(old_sessions)} old sessions")
        
        return {
            "success": True,
            "cleaned_sessions": len(old_sessions),
            "active_sessions": len(chat_sessions)
        }
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        raise HTTPException(status_code=500, detail="Cleanup failed")

# Main application entry point
if __name__ == "__main__":
    import uvicorn
    
    # Get configuration from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    reload = os.getenv("RELOAD", "true").lower() == "true"
    
    logger.info(f"🚀 Starting server on {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        log_level=os.getenv('LOG_LEVEL', 'info').lower()
    )
