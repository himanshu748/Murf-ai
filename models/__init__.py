"""
Pydantic Models for Murf AI Conversational Bot
Day 14 Refactored Models
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime

# Chat History Models
class ChatMessage(BaseModel):
    """Individual chat message model"""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(default_factory=datetime.now, description="Message timestamp")
    
    @validator('role')
    def validate_role(cls, v):
        if v not in ['user', 'assistant', 'system']:
            raise ValueError('Role must be user, assistant, or system')
        return v

class ChatHistory(BaseModel):
    """Chat history collection model"""
    session_id: str = Field(..., description="Unique session identifier")
    messages: List[ChatMessage] = Field(default=[], description="List of chat messages")
    created_at: datetime = Field(default_factory=datetime.now, description="Session creation time")
    updated_at: datetime = Field(default_factory=datetime.now, description="Last update time")

# Request Models
class TTSRequest(BaseModel):
    """Text-to-Speech request model"""
    text: str = Field(..., min_length=1, max_length=5000, description="Text to convert to speech")
    voice_id: Optional[str] = Field(None, description="Voice ID to use")
    speech_rate: Optional[float] = Field(1.0, ge=0.5, le=2.0, description="Speech rate multiplier")

class LLMRequest(BaseModel):
    """LLM query request model"""
    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    session_id: Optional[str] = Field(None, description="Session ID for context")
    include_history: bool = Field(True, description="Whether to include chat history")

# Response Models
class TTSResponse(BaseModel):
    """Text-to-Speech response model"""
    success: bool = Field(..., description="Whether TTS generation was successful")
    audio_url: Optional[str] = Field(None, description="URL to generated audio file")
    voice_id: Optional[str] = Field(None, description="Voice ID used")
    error: Optional[str] = Field(None, description="Error message if failed")
    fallback_message: Optional[str] = Field(None, description="Fallback text message")

class STTResponse(BaseModel):
    """Speech-to-Text response model"""
    success: bool = Field(..., description="Whether STT transcription was successful")
    transcript: str = Field(..., description="Transcribed text")
    confidence: Optional[float] = Field(None, description="Transcription confidence score")
    language_code: Optional[str] = Field(None, description="Detected language")
    error: Optional[str] = Field(None, description="Error message if failed")

class LLMResponse(BaseModel):
    """LLM query response model"""
    success: bool = Field(..., description="Whether LLM generation was successful")
    response: str = Field(..., description="Generated response text")
    model: Optional[str] = Field(None, description="Model used for generation")
    tokens_used: Optional[int] = Field(None, description="Number of tokens used")
    error: Optional[str] = Field(None, description="Error message if failed")

class ConversationResponse(BaseModel):
    """Complete conversation response model (Days 10-14)"""
    success: bool = Field(..., description="Whether conversation processing was successful")
    transcript: Optional[str] = Field(None, description="User input transcription")
    response: Optional[str] = Field(None, description="AI response text")
    audio_url: Optional[str] = Field(None, description="AI response audio URL")
    session_id: str = Field(..., description="Session identifier")
    message_count: int = Field(..., description="Total messages in conversation")
    error: Optional[str] = Field(None, description="Error message if failed")
    processing_time: Optional[float] = Field(None, description="Total processing time in seconds")

# Service Status Models
class ServiceStatus(BaseModel):
    """Service status model"""
    service: str = Field(..., description="Service name")
    status: str = Field(..., description="Service status: active, limited, or offline")
    api_key_configured: bool = Field(..., description="Whether API key is configured")
    api_accessible: bool = Field(..., description="Whether API is accessible")
    additional_info: Optional[Dict[str, Any]] = Field(None, description="Additional service information")

class SystemStatus(BaseModel):
    """Overall system status model"""
    status: str = Field(..., description="Overall system status")
    services: Dict[str, ServiceStatus] = Field(..., description="Individual service statuses")
    uptime: float = Field(..., description="System uptime in seconds")
    version: str = Field(..., description="Application version")
    timestamp: datetime = Field(default_factory=datetime.now, description="Status check timestamp")

# File Upload Models
class FileUploadResponse(BaseModel):
    """File upload response model"""
    success: bool = Field(..., description="Whether file upload was successful")
    filename: Optional[str] = Field(None, description="Uploaded filename")
    file_size: Optional[int] = Field(None, description="File size in bytes")
    content_type: Optional[str] = Field(None, description="File content type")
    error: Optional[str] = Field(None, description="Error message if failed")

# Error Models
class ErrorResponse(BaseModel):
    """Standard error response model"""
    error: bool = Field(True, description="Always true for error responses")
    message: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(None, description="Error code for programmatic handling")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    timestamp: datetime = Field(default_factory=datetime.now, description="Error timestamp")

# Health Check Model
class HealthResponse(BaseModel):
    """Health check response model"""
    status: str = Field(..., description="Health status: healthy, degraded, or unhealthy")
    timestamp: datetime = Field(default_factory=datetime.now, description="Health check timestamp")
    services: Dict[str, str] = Field(..., description="Service health statuses")
    version: str = Field("1.0.0", description="Application version")

# Export all models
__all__ = [
    'ChatMessage',
    'ChatHistory', 
    'TTSRequest',
    'LLMRequest',
    'TTSResponse',
    'STTResponse',
    'LLMResponse',
    'ConversationResponse',
    'ServiceStatus',
    'SystemStatus',
    'FileUploadResponse',
    'ErrorResponse',
    'HealthResponse'
]
