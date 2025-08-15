"""
Speech-to-Text Service using AssemblyAI
Day 14 Refactored Module
"""

import os
import logging
import tempfile
from typing import Optional, Dict, Any
import assemblyai as aai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

class STTService:
    """AssemblyAI Speech-to-Text Service"""
    
    def __init__(self):
        """Initialize STT service with AssemblyAI configuration"""
        self.api_key = os.getenv('ASSEMBLYAI_API_KEY')
        if not self.api_key:
            raise ValueError("ASSEMBLYAI_API_KEY not found in environment variables")
        
        # Configure AssemblyAI
        aai.settings.api_key = self.api_key
        
        # Service configuration
        self.config = {
            'language_code': os.getenv('STT_LANGUAGE_CODE', 'en-US'),
            'enable_automatic_punctuation': os.getenv('STT_ENABLE_AUTOMATIC_PUNCTUATION', 'true').lower() == 'true',
            'base_url': os.getenv('ASSEMBLYAI_API_BASE_URL', 'https://api.assemblyai.com/v2')
        }
        
        logger.info(f"STT Service initialized with language: {self.config['language_code']}")
    
    async def transcribe_audio(self, audio_data: bytes, filename: str = "audio.webm") -> Dict[str, Any]:
        """
        Transcribe audio data using AssemblyAI
        
        Args:
            audio_data (bytes): Raw audio data
            filename (str): Original filename for context
            
        Returns:
            Dict containing transcription result and metadata
            
        Raises:
            Exception: If transcription fails
        """
        try:
            logger.info(f"Starting transcription for audio file: {filename}")
            
            # Create temporary file for audio data
            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name
            
            try:
                # Configure transcription settings
                config = aai.TranscriptionConfig(
                    language_code=self.config['language_code'],
                    punctuate=self.config['enable_automatic_punctuation'],
                    format_text=True
                )
                
                # Create transcriber and transcribe
                transcriber = aai.Transcriber(config=config)
                transcript = transcriber.transcribe(temp_path)
                
                # Check for errors
                if transcript.status == aai.TranscriptStatus.error:
                    raise Exception(f"Transcription failed: {transcript.error}")
                
                # Prepare result
                result = {
                    'success': True,
                    'transcript': transcript.text or "",
                    'confidence': getattr(transcript, 'confidence', None),
                    'language_code': self.config['language_code'],
                    'words': getattr(transcript, 'words', []),
                    'audio_duration': getattr(transcript, 'audio_duration', None)
                }
                
                logger.info(f"Transcription successful: '{transcript.text[:100]}{'...' if len(transcript.text) > 100 else ''}'")
                return result
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_path)
                except OSError:
                    logger.warning(f"Failed to delete temporary file: {temp_path}")
                
        except Exception as e:
            logger.error(f"STT transcription failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'transcript': "",
                'fallback_message': "I couldn't understand what you said. Please try again."
            }
    
    def transcribe_file(self, file_path: str) -> Dict[str, Any]:
        """
        Transcribe audio file directly (synchronous version)
        
        Args:
            file_path (str): Path to audio file
            
        Returns:
            Dict containing transcription result
        """
        try:
            logger.info(f"Transcribing file: {file_path}")
            
            # Configure transcription settings
            config = aai.TranscriptionConfig(
                language_code=self.config['language_code'],
                punctuate=self.config['enable_automatic_punctuation'],
                format_text=True
            )
            
            # Create transcriber and transcribe
            transcriber = aai.Transcriber(config=config)
            transcript = transcriber.transcribe(file_path)
            
            # Check for errors
            if transcript.status == aai.TranscriptStatus.error:
                raise Exception(f"Transcription failed: {transcript.error}")
            
            result = {
                'success': True,
                'transcript': transcript.text or "",
                'confidence': getattr(transcript, 'confidence', None),
                'language_code': self.config['language_code']
            }
            
            logger.info(f"File transcription successful: '{transcript.text[:100]}{'...' if len(transcript.text) > 100 else ''}'")
            return result
            
        except Exception as e:
            logger.error(f"File transcription failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'transcript': "",
                'fallback_message': "I couldn't transcribe the audio file. Please try again."
            }
    
    def get_supported_languages(self) -> list:
        """
        Get list of supported languages
        
        Returns:
            List of supported language codes
        """
        # Common AssemblyAI supported languages
        return [
            'en-US', 'en-GB', 'en-AU', 'en-IN',
            'es-ES', 'es-MX', 'fr-FR', 'de-DE',
            'it-IT', 'pt-PT', 'pt-BR', 'nl-NL',
            'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW',
            'ru-RU', 'ar-SA', 'hi-IN', 'tr-TR'
        ]
    
    def validate_audio_format(self, filename: str) -> bool:
        """
        Validate if audio format is supported
        
        Args:
            filename (str): Audio filename
            
        Returns:
            bool: True if format is supported
        """
        supported_formats = ['.mp3', '.wav', '.webm', '.ogg', '.m4a', '.flac', '.aac']
        file_extension = os.path.splitext(filename.lower())[1]
        return file_extension in supported_formats
    
    def get_service_status(self) -> Dict[str, Any]:
        """
        Get STT service status and configuration
        
        Returns:
            Dict containing service status
        """
        return {
            'service': 'AssemblyAI STT',
            'status': 'active',
            'api_key_configured': bool(self.api_key),
            'language_code': self.config['language_code'],
            'auto_punctuation': self.config['enable_automatic_punctuation'],
            'supported_formats': ['.mp3', '.wav', '.webm', '.ogg', '.m4a', '.flac', '.aac']
        }
