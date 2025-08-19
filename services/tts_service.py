"""
Text-to-Speech Service using Murf AI
Handles voice generation with male voice preference and error handling
"""

import os
import logging
import tempfile
from typing import Optional
import aiohttp
import aiofiles

from models.message_models import ServiceStatus

logger = logging.getLogger(__name__)

class TTSService:
    """Service for handling text-to-speech operations using Murf AI"""
    
    def __init__(self):
        self.api_key = os.getenv("MURF_API_KEY")
        self.base_url = "https://api.murf.ai"
        
        if not self.api_key:
            logger.error("MURF_API_KEY not found in environment variables")
            raise ValueError("Murf AI API key is required")
        
        # Updated Indian male voice configuration for Murf AI
        self.default_voice_id = "en-IN-aarav"  # Indian English male voice
        self.default_voice_style = "Conversational"
        
        self.headers = {
            "accept": "application/json",
            "content-type": "application/json", 
            "x-api-key": self.api_key
        }
        
        logger.info("TTS Service initialized with Murf AI")
    
    def is_healthy(self) -> bool:
        """Check if the service is healthy"""
        return bool(self.api_key)
    
    async def generate_speech(
        self, 
        text: str, 
        voice_id: Optional[str] = None,
        speed: float = 1.0
    ) -> Optional[str]:
        """
        Generate speech from text using Murf AI with fallback to browser TTS
        
        Args:
            text: Text to convert to speech
            voice_id: Voice ID to use (optional, uses default male voice)
            speed: Speech speed (0.5 to 2.0)
            
        Returns:
            URL to generated audio file or "browser_tts" for fallback
        """
        try:
            if not text or not text.strip():
                logger.warning("Empty text provided for TTS")
                return None
            
            # Use default male voice if not specified
            selected_voice = voice_id or self.default_voice_id
            
            # Correct Murf API payload structure
            payload = {
                "text": text.strip(),
                "voice": selected_voice,
                "voiceStyle": self.default_voice_style,
                "rate": max(0.5, min(2.0, speed)),
                "pronunciation": []
            }
            
            logger.info(f"Sending TTS request to Murf AI: {text[:50]}...")
            
            # Make API request to correct Murf endpoint
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/v2/speech/generate-audio",
                    headers=self.headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        logger.info(f"Murf AI response: {result}")
                        
                        # Handle different possible response structures
                        audio_url = (result.get("audioFile") or 
                                   result.get("audioUrl") or 
                                   result.get("audio_url") or
                                   result.get("url"))
                        
                        if audio_url:
                            logger.info(f"TTS generated successfully for text: {text[:50]}...")
                            return audio_url
                        else:
                            logger.error(f"No audio URL in Murf AI response: {result}")
                            return "browser_tts"  # Fallback
                    
                    elif response.status == 429:
                        logger.warning("Murf AI rate limit exceeded, using browser TTS")
                        return "browser_tts"
                    
                    else:
                        error_text = await response.text()
                        logger.error(f"Murf AI API error {response.status}: {error_text}")
                        return "browser_tts"  # Fallback to browser TTS
                        
        except aiohttp.ClientTimeout:
            logger.error("Murf AI API request timed out")
            return None
        except Exception as e:
            logger.error(f"Error generating speech: {str(e)}")
            return None
    
    async def generate_speech_file(
        self, 
        text: str, 
        output_path: Optional[str] = None,
        voice_id: Optional[str] = None,
        speed: float = 1.0
    ) -> Optional[str]:
        """
        Generate speech and save to file
        
        Args:
            text: Text to convert to speech
            output_path: Path to save audio file (optional, creates temp file)
            voice_id: Voice ID to use (optional)
            speed: Speech speed
            
        Returns:
            Path to saved audio file or None if failed
        """
        try:
            # Generate speech URL
            audio_url = await self.generate_speech(text, voice_id, speed)
            if not audio_url:
                return None
            
            # Download audio file
            async with aiohttp.ClientSession() as session:
                async with session.get(audio_url) as response:
                    if response.status == 200:
                        # Create output path if not provided
                        if not output_path:
                            temp_file = tempfile.NamedTemporaryFile(
                                suffix=".mp3", 
                                delete=False
                            )
                            output_path = temp_file.name
                            temp_file.close()
                        
                        # Save audio data
                        audio_data = await response.read()
                        async with aiofiles.open(output_path, 'wb') as f:
                            await f.write(audio_data)
                        
                        logger.info(f"Audio saved to: {output_path}")
                        return output_path
                    else:
                        logger.error(f"Failed to download audio: {response.status}")
                        return None
                        
        except Exception as e:
            logger.error(f"Error generating speech file: {str(e)}")
            return None
    
    async def get_available_voices(self) -> Optional[list]:
        """
        Get list of available voices from Murf AI
        
        Returns:
            List of available voices or None if failed
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/voices",
                    headers=self.headers,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        voices = result.get("voices", [])
                        
                        # Filter for male voices
                        male_voices = [
                            voice for voice in voices 
                            if voice.get("gender", "").lower() == "male"
                        ]
                        
                        logger.info(f"Retrieved {len(male_voices)} male voices from Murf AI")
                        return male_voices
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to get voices: {response.status} - {error_text}")
                        return None
                        
        except Exception as e:
            logger.error(f"Error getting available voices: {str(e)}")
            return None
    
    async def test_voice_generation(self) -> bool:
        """
        Test voice generation with a simple phrase
        
        Returns:
            True if test successful, False otherwise
        """
        try:
            test_text = "Hello, this is a test of the Murf AI voice generation service."
            audio_url = await self.generate_speech(test_text)
            
            if audio_url and audio_url != "browser_tts":
                logger.info("TTS service test successful")
                return True
            else:
                logger.error("TTS service test failed - using browser fallback")
                return False
                
        except Exception as e:
            logger.error(f"TTS service test error: {str(e)}")
            return False
    
    async def check_murf_api_connection(self) -> dict:
        """
        Check Murf API connection and return detailed status
        
        Returns:
            Dict with connection status and details
        """
        try:
            # Test with minimal request to check API connectivity
            test_payload = {
                "text": "Test",
                "voice": self.default_voice_id,
                "voiceStyle": self.default_voice_style,
                "rate": 1.0,
                "pronunciation": []
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/v2/speech/generate-audio",
                    headers=self.headers,
                    json=test_payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    
                    response_text = await response.text()
                    
                    return {
                        "status": "connected" if response.status in [200, 429] else "error",
                        "status_code": response.status,
                        "response": response_text[:500],  # Truncate long responses
                        "headers_sent": dict(self.headers),
                        "api_key_present": bool(self.api_key),
                        "api_key_length": len(self.api_key) if self.api_key else 0
                    }
                    
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "api_key_present": bool(self.api_key),
                "api_key_length": len(self.api_key) if self.api_key else 0
            }
    
    def get_status(self) -> ServiceStatus:
        """Get service status"""
        return ServiceStatus(
            service_name="TTS (Murf AI)",
            is_healthy=self.is_healthy(),
            error_message=None if self.is_healthy() else "API key not configured"
        )
    
    def get_default_voice_config(self) -> dict:
        """Get default voice configuration"""
        return {
            "voice_id": self.default_voice_id,
            "style": self.default_voice_style,
            "gender": "male",
            "language": "en-US"
        }
