"""
Pydantic models for Murf AI Voice Agent
Defines data structures for messages, sessions, and API responses
"""

from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from enum import Enum

class MessageRole(str, Enum):
    """Enumeration for message roles"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

class WebSocketMessageType(str, Enum):
    """Enumeration for WebSocket message types"""
    CONNECTION = "connection"
    SESSION_CREATE = "session_create"
    SESSION_JOIN = "session_join"
    SESSION_CREATED = "session_created"
    SESSION_JOINED = "session_joined"
    ECHO = "echo"
    ECHO_RESPONSE = "echo_response"
    VOICE_MESSAGE = "voice_message"
    TEXT_MESSAGE = "text_message"
    TRANSCRIPTION_COMPLETE = "transcription_complete"
    AI_RESPONSE = "ai_response"
    VOICE_RESPONSE = "voice_response"
    PROCESSING_STATUS = "processing_status"
    ERROR = "error"
    USER_DISCONNECTED = "user_disconnected"

class ProcessingStage(str, Enum):
    """Enumeration for processing stages"""
    TRANSCRIPTION = "transcription"
    THINKING = "thinking"
    VOICE_GENERATION = "voice_generation"
    COMPLETE = "complete"

class ChatMessage(BaseModel):
    """Model for chat messages"""
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class WebSocketMessage(BaseModel):
    """Model for WebSocket messages"""
    type: WebSocketMessageType
    message: Optional[str] = None
    session_id: Optional[str] = None
    audio_data: Optional[str] = None  # Base64 encoded
    text: Optional[str] = None
    transcript: Optional[str] = None
    audio_url: Optional[str] = None
    stage: Optional[ProcessingStage] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: Optional[Dict[str, Any]] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class SessionInfo(BaseModel):
    """Model for session information"""
    session_id: str
    message_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ErrorResponse(BaseModel):
    """Model for error responses"""
    error: bool = True
    message: str
    error_code: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class TTSRequest(BaseModel):
    """Model for text-to-speech requests"""
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: Optional[str] = None
    speed: Optional[float] = Field(1.0, ge=0.5, le=2.0)
    session_id: Optional[str] = None

class STTRequest(BaseModel):
    """Model for speech-to-text requests"""
    audio_data: str = Field(..., description="Base64 encoded audio data")
    audio_format: Optional[str] = "wav"
    session_id: Optional[str] = None

class LLMRequest(BaseModel):
    """Model for language model requests"""
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = []
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(150, ge=1, le=500)

class ServiceStatus(BaseModel):
    """Model for service health status"""
    service_name: str
    is_healthy: bool
    last_check: datetime = Field(default_factory=datetime.utcnow)
    error_message: Optional[str] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class HealthCheckResponse(BaseModel):
    """Model for health check responses"""
    status: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    services: Dict[str, bool]
    uptime_seconds: Optional[float] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
