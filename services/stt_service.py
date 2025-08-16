"""
Speech-to-Text Service using AssemblyAI
Handles audio transcription with error handling and optimization
"""

import os
import base64
import logging
import tempfile
from typing import Optional
import aiofiles
import aiohttp

from models.message_models import ServiceStatus

logger = logging.getLogger(__name__)

class STTService:
    """Service for handling speech-to-text operations using AssemblyAI"""
    
    def __init__(self):
        self.api_key = os.getenv("ASSEMBLYAI_API_KEY")
        self.base_url = "https://api.assemblyai.com/v2"
        self.upload_url = f"{self.base_url}/upload"
        self.transcript_url = f"{self.base_url}/transcript"
        
        if not self.api_key:
            logger.error("ASSEMBLYAI_API_KEY not found in environment variables")
            raise ValueError("AssemblyAI API key is required")
        
        self.headers = {
            "authorization": self.api_key,
            "content-type": "application/json"
        }
        
        logger.info("STT Service initialized with AssemblyAI")
    
    def is_healthy(self) -> bool:
        """Check if the service is healthy"""
        return bool(self.api_key)
    
    async def transcribe_audio_base64(self, audio_data: str) -> Optional[str]:
        """
        Transcribe audio from base64 encoded data
        
        Args:
            audio_data: Base64 encoded audio data
            
        Returns:
            Transcribed text or None if failed
        """
        try:
            # Decode base64 audio data
            audio_bytes = base64.b64decode(audio_data)
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_file.write(audio_bytes)
                temp_file_path = temp_file.name
            
            try:
                # Upload audio file
                upload_response = await self._upload_audio_file(temp_file_path)
                if not upload_response:
                    return None
                
                audio_url = upload_response.get("upload_url")
                if not audio_url:
                    logger.error("No upload URL received from AssemblyAI")
                    return None
                
                # Request transcription
                transcript_response = await self._request_transcription(audio_url)
                if not transcript_response:
                    return None
                
                transcript_id = transcript_response.get("id")
                if not transcript_id:
                    logger.error("No transcript ID received from AssemblyAI")
                    return None
                
                # Poll for completion
                transcript_result = await self._poll_transcription(transcript_id)
                if transcript_result and transcript_result.get("status") == "completed":
                    text = transcript_result.get("text", "").strip()
                    logger.info(f"Transcription completed: {text[:100]}...")
                    return text
                else:
                    logger.error("Transcription failed or timed out")
                    return None
                    
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_file_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temp file: {str(e)}")
            
        except Exception as e:
            logger.error(f"Error in transcribe_audio_base64: {str(e)}")
            return None
    
    async def _upload_audio_file(self, file_path: str) -> Optional[dict]:
        """Upload audio file to AssemblyAI"""
        try:
            async with aiohttp.ClientSession() as session:
                async with aiofiles.open(file_path, 'rb') as f:
                    audio_data = await f.read()
                
                async with session.post(
                    self.upload_url,
                    headers={"authorization": self.api_key},
                    data=audio_data
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.debug("Audio uploaded successfully to AssemblyAI")
                        return result
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to upload audio: {response.status} - {error_text}")
                        return None
                        
        except Exception as e:
            logger.error(f"Error uploading audio file: {str(e)}")
            return None
    
    async def _request_transcription(self, audio_url: str) -> Optional[dict]:
        """Request transcription from AssemblyAI"""
        try:
            transcription_request = {
                "audio_url": audio_url,
                "language_detection": True,
                "punctuate": True,
                "format_text": True
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.transcript_url,
                    headers=self.headers,
                    json=transcription_request
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.debug("Transcription requested successfully")
                        return result
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to request transcription: {response.status} - {error_text}")
                        return None
                        
        except Exception as e:
            logger.error(f"Error requesting transcription: {str(e)}")
            return None
    
    async def _poll_transcription(self, transcript_id: str, max_attempts: int = 30) -> Optional[dict]:
        """Poll for transcription completion"""
        import asyncio
        
        try:
            poll_url = f"{self.transcript_url}/{transcript_id}"
            
            for attempt in range(max_attempts):
                async with aiohttp.ClientSession() as session:
                    async with session.get(poll_url, headers=self.headers) as response:
                        if response.status == 200:
                            result = await response.json()
                            status = result.get("status")
                            
                            if status == "completed":
                                logger.debug("Transcription completed successfully")
                                return result
                            elif status == "error":
                                error_msg = result.get("error", "Unknown error")
                                logger.error(f"Transcription failed with error: {error_msg}")
                                return None
                            elif status in ["queued", "processing"]:
                                logger.debug(f"Transcription status: {status}, attempt {attempt + 1}")
                                await asyncio.sleep(2)  # Wait 2 seconds before next poll
                                continue
                            else:
                                logger.warning(f"Unknown transcription status: {status}")
                                return None
                        else:
                            error_text = await response.text()
                            logger.error(f"Error polling transcription: {response.status} - {error_text}")
                            return None
            
            logger.error("Transcription polling timed out")
            return None
            
        except Exception as e:
            logger.error(f"Error polling transcription: {str(e)}")
            return None
    
    async def transcribe_file_path(self, file_path: str) -> Optional[str]:
        """
        Transcribe audio from file path
        
        Args:
            file_path: Path to audio file
            
        Returns:
            Transcribed text or None if failed
        """
        try:
            # Upload audio file
            upload_response = await self._upload_audio_file(file_path)
            if not upload_response:
                return None
            
            audio_url = upload_response.get("upload_url")
            if not audio_url:
                return None
            
            # Request transcription
            transcript_response = await self._request_transcription(audio_url)
            if not transcript_response:
                return None
            
            transcript_id = transcript_response.get("id")
            if not transcript_id:
                return None
            
            # Poll for completion
            transcript_result = await self._poll_transcription(transcript_id)
            if transcript_result and transcript_result.get("status") == "completed":
                return transcript_result.get("text", "").strip()
            
            return None
            
        except Exception as e:
            logger.error(f"Error in transcribe_file_path: {str(e)}")
            return None
    
    def get_status(self) -> ServiceStatus:
        """Get service status"""
        return ServiceStatus(
            service_name="STT (AssemblyAI)",
            is_healthy=self.is_healthy(),
            error_message=None if self.is_healthy() else "API key not configured"
        )
