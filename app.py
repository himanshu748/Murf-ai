#!/usr/bin/env python3
"""
Murf AI Voice Agent - Complete 14-Day Implementation
A robust voice-first AI assistant using Murf AI, AssemblyAI, and Perplexity AI

This application represents the culmination of a 14-day learning journey
building a production-ready voice AI assistant.
"""

import os
import sys
import logging
import asyncio
import traceback
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from contextlib import asynccontextmanager
import json
import tempfile
import uuid

# FastAPI imports
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Request, Form
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

# Environment configuration
from dotenv import load_dotenv
load_dotenv()

# Configure comprehensive logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('voice_agent.log', mode='a', encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)

# Import our enhanced services
try:
    from core.voice_service import VoiceService
    from core.models import *
    from core.session_manager import SessionManager
    from core.error_handler import ErrorHandler
except ImportError as e:
    logger.error(f"Failed to import core modules: {e}")
    logger.error("Creating core modules...")

# Global application state
app_state = {
    'voice_service': None,
    'session_manager': None,
    'error_handler': None,
    'startup_time': datetime.now()
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management with comprehensive initialization"""
    logger.info("🚀 Starting Murf AI Voice Agent...")
    
    try:
        # Initialize error handler first
        app_state['error_handler'] = ErrorHandler()
        logger.info("✅ Error handler initialized")
        
        # Initialize session manager
        app_state['session_manager'] = SessionManager()
        logger.info("✅ Session manager initialized")
        
        # Initialize voice service (this handles all 3 APIs)
        app_state['voice_service'] = VoiceService()
        await app_state['voice_service'].initialize()
        logger.info("✅ Voice service initialized")
        
        # Store in app state
        app.state.voice_service = app_state['voice_service']
        app.state.session_manager = app_state['session_manager']
        app.state.error_handler = app_state['error_handler']
        
        logger.info("🎉 All services initialized successfully!")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Don't raise - let app start in degraded mode
        
    yield
    
    logger.info("🛑 Shutting down Murf AI Voice Agent...")
    
    # Cleanup
    if app_state['voice_service']:
        await app_state['voice_service'].cleanup()
    
    logger.info("✅ Shutdown complete")

# Create FastAPI application
app = FastAPI(
    title="🎤 Murf AI Voice Agent",
    description="""
    A production-ready AI voice assistant built with:
    - Murf AI for Text-to-Speech
    - AssemblyAI for Speech-to-Text  
    - Perplexity AI for Intelligence
    
    Complete 14-day learning journey implementation.
    """,
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
    logger.info("✅ Static files mounted")
except Exception as e:
    logger.warning(f"⚠️ Could not mount static files: {e}")

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Comprehensive global exception handling"""
    error_id = str(uuid.uuid4())
    logger.error(f"Global exception [{error_id}] on {request.url}: {exc}")
    logger.error(f"Traceback: {traceback.format_exc()}")
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error occurred",
            "error_id": error_id,
            "timestamp": datetime.now().isoformat(),
            "details": str(exc) if os.getenv("DEBUG", "false").lower() == "true" else "Contact support"
        }
    )

# Health check endpoint
@app.get("/health")
async def health_check():
    """Comprehensive health check"""
    try:
        health_status = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "uptime": str(datetime.now() - app_state['startup_time']),
            "services": {}
        }
        
        # Check voice service
        if app_state['voice_service']:
            voice_health = await app_state['voice_service'].health_check()
            health_status['services']['voice'] = voice_health
        else:
            health_status['services']['voice'] = {"status": "not_initialized"}
            health_status['status'] = "degraded"
        
        # Check session manager
        if app_state['session_manager']:
            session_health = app_state['session_manager'].health_check()
            health_status['services']['sessions'] = session_health
        else:
            health_status['services']['sessions'] = {"status": "not_initialized"}
            health_status['status'] = "degraded"
        
        return health_status
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }

# Main voice endpoint
@app.post("/voice/chat")
async def voice_chat(
    audio: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    voice_id: Optional[str] = Form(None)
):
    """
    Main voice chat endpoint - handles the complete voice conversation pipeline
    
    Process: Audio → STT → LLM → TTS → Audio Response
    """
    request_id = str(uuid.uuid4())
    start_time = datetime.now()
    
    logger.info(f"🎤 Voice chat request [{request_id}] started")
    
    try:
        # Validate services
        if not app_state['voice_service']:
            raise HTTPException(
                status_code=503, 
                detail="Voice service not available. Please try again later."
            )
        
        # Generate session ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
            logger.info(f"Generated new session: {session_id}")
        
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
        
        logger.info(f"[{request_id}] Processing audio: {len(audio_data)} bytes")
        
        # Process voice conversation
        result = await app_state['voice_service'].process_conversation(
            audio_data=audio_data,
            session_id=session_id,
            voice_id=voice_id,
            request_id=request_id
        )
        
        # Add timing information
        processing_time = (datetime.now() - start_time).total_seconds()
        result['processing_time'] = processing_time
        result['request_id'] = request_id
        result['session_id'] = session_id
        
        logger.info(f"[{request_id}] Completed in {processing_time:.2f}s")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{request_id}] Voice chat failed: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        return {
            "success": False,
            "error": str(e),
            "request_id": request_id,
            "session_id": session_id,
            "processing_time": processing_time,
            "timestamp": datetime.now().isoformat()
        }

# Voice interface endpoints
@app.get("/", response_class=HTMLResponse)
async def serve_voice_interface():
    """Serve the main voice interface"""
    try:
        return FileResponse("static/index.html")
    except Exception as e:
        logger.error(f"Failed to serve voice interface: {e}")
        return HTMLResponse(
            content="<h1>Voice Agent</h1><p>Interface not available. Check server logs.</p>",
            status_code=500
        )

@app.get("/voice", response_class=HTMLResponse)
async def serve_clean_voice_interface():
    """Serve the clean voice interface"""
    try:
        return FileResponse("static/voice.html")
    except Exception as e:
        logger.error(f"Failed to serve clean voice interface: {e}")
        return HTMLResponse(
            content="<h1>Voice Agent</h1><p>Clean interface not available. Check server logs.</p>",
            status_code=500
        )

# Session management endpoints
@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session information"""
    try:
        if not app_state['session_manager']:
            raise HTTPException(status_code=503, detail="Session service not available")
        
        session_info = app_state['session_manager'].get_session(session_id)
        if not session_info:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {
            "success": True,
            "session": session_info,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/sessions/{session_id}")
async def clear_session(session_id: str):
    """Clear session data"""
    try:
        if not app_state['session_manager']:
            raise HTTPException(status_code=503, detail="Session service not available")
        
        cleared = app_state['session_manager'].clear_session(session_id)
        
        return {
            "success": True,
            "cleared": cleared,
            "session_id": session_id,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to clear session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Voice configuration endpoints
@app.get("/voices")
async def get_available_voices():
    """Get list of available voices"""
    try:
        if not app_state['voice_service']:
            raise HTTPException(status_code=503, detail="Voice service not available")
        
        voices = await app_state['voice_service'].get_available_voices()
        
        return {
            "success": True,
            "voices": voices,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to get voices: {e}")
        return {
            "success": False,
            "error": str(e),
            "voices": [],
            "timestamp": datetime.now().isoformat()
        }

# Development and debugging endpoints
@app.get("/debug/status")
async def debug_status():
    """Get detailed system status for debugging"""
    try:
        status = {
            "timestamp": datetime.now().isoformat(),
            "uptime": str(datetime.now() - app_state['startup_time']),
            "environment": {
                "python_version": sys.version,
                "platform": sys.platform,
                "cwd": os.getcwd()
            },
            "services": {},
            "configuration": {
                "log_level": logging.getLogger().getEffectiveLevel(),
                "debug_mode": os.getenv("DEBUG", "false").lower() == "true"
            }
        }
        
        # Service status
        for service_name, service in app_state.items():
            if service and hasattr(service, 'health_check'):
                try:
                    if asyncio.iscoroutinefunction(service.health_check):
                        service_status = await service.health_check()
                    else:
                        service_status = service.health_check()
                    status['services'][service_name] = service_status
                except Exception as e:
                    status['services'][service_name] = {"status": "error", "error": str(e)}
            else:
                status['services'][service_name] = {"status": "not_available"}
        
        return status
        
    except Exception as e:
        logger.error(f"Debug status failed: {e}")
        return {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

if __name__ == "__main__":
    import uvicorn
    
    # Configuration
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    reload = os.getenv("RELOAD", "true").lower() == "true"
    log_level = os.getenv("LOG_LEVEL", "info").lower()
    
    logger.info(f"🚀 Starting Murf AI Voice Agent on {host}:{port}")
    logger.info(f"📊 Configuration: reload={reload}, log_level={log_level}")
    
    try:
        uvicorn.run(
            "app:app",
            host=host,
            port=port,
            reload=reload,
            log_level=log_level,
            access_log=True
        )
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)
