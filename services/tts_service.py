"""
Text-to-Speech Service using Murf AI
Day 14 Refactored Module
"""

import os
import logging
import requests
import tempfile
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

class TTSService:
    """Murf AI Text-to-Speech Service"""
    
    def __init__(self):
        """Initialize TTS service with Murf AI configuration"""
        self.api_key = os.getenv('MURF_API_KEY')
        if not self.api_key:
            raise ValueError("MURF_API_KEY not found in environment variables")
        
        # Service configuration
        self.config = {
            'base_url': os.getenv('MURF_API_BASE_URL', 'https://api.murf.ai/v1'),
            'default_voice_id': os.getenv('DEFAULT_VOICE_ID', 'en-US-aileen'),
            'output_format': os.getenv('TTS_OUTPUT_FORMAT', 'mp3'),
            'speech_rate': float(os.getenv('TTS_SPEECH_RATE', '1.0'))
        }
        
        # Request headers
        self.headers = {
            'api-key': self.api_key,
            'Content-Type': 'application/json',
            'User-Agent': 'Murf-AI-Bot/1.0'
        }
        
        logger.info(f"TTS Service initialized with voice: {self.config['default_voice_id']}")
    
    async def generate_speech(self, text: str, voice_id: Optional[str] = None, 
                            speech_rate: Optional[float] = None) -> Dict[str, Any]:
        """
        Generate speech from text using Murf AI
        
        Args:
            text (str): Text to convert to speech
            voice_id (str, optional): Voice ID to use
            speech_rate (float, optional): Speech rate (0.5 to 2.0)
            
        Returns:
            Dict containing TTS result and metadata
        """
        try:
            logger.info(f"Generating TTS for text: '{text[:100]}{'...' if len(text) > 100 else ''}'")
            
            # Use provided values or defaults
            voice_id = voice_id or self.config['default_voice_id']
            speech_rate = speech_rate or self.config['speech_rate']
            
            # Prepare request payload
            payload = {
                'text': text,
                'voiceId': voice_id,
                'outputFormat': self.config['output_format'],
                'speechRate': speech_rate,
                'model': 'murf-1'
            }
            
            # Make API request
            response = requests.post(
                f"{self.config['base_url']}/speech/generate",
                json=payload,
                headers=self.headers,
                timeout=30
            )
            
            # Check response status
            if response.status_code != 200:
                raise Exception(f"Murf API error {response.status_code}: {response.text}")
            
            # Parse response
            result_data = response.json()
            
            if not result_data.get('success', False):
                raise Exception(f"Murf API failed: {result_data.get('message', 'Unknown error')}")
            
            # Prepare result
            result = {
                'success': True,
                'audio_url': result_data.get('audioFile'),
                'voice_id': voice_id,
                'text_length': len(text),
                'estimated_duration': len(text) * 0.05,  # Rough estimate: 20 words per second
                'format': self.config['output_format'],
                'speech_rate': speech_rate
            }
            
            logger.info(f"TTS generation successful, audio URL: {result['audio_url']}")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"TTS network error: {str(e)}")
            return {
                'success': False,
                'error': f"Network error: {str(e)}",
                'fallback_message': "I'm having trouble generating speech right now. Please try again."
            }
        except Exception as e:
            logger.error(f"TTS generation failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'fallback_message': "Speech generation failed. Please try again."
            }
    
    def generate_speech_sync(self, text: str, voice_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Synchronous version of speech generation (legacy support)
        
        Args:
            text (str): Text to convert to speech
            voice_id (str, optional): Voice ID to use
            
        Returns:
            Dict containing TTS result
        """
        try:
            voice_id = voice_id or self.config['default_voice_id']
            
            payload = {
                'text': text,
                'voiceId': voice_id,
                'outputFormat': self.config['output_format'],
                'model': 'murf-1'
            }
            
            response = requests.post(
                f"{self.config['base_url']}/speech/generate",
                json=payload,
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code != 200:
                raise Exception(f"Murf API error {response.status_code}: {response.text}")
            
            result_data = response.json()
            
            if not result_data.get('success', False):
                raise Exception(f"Murf API failed: {result_data.get('message', 'Unknown error')}")
            
            return {
                'success': True,
                'audio_url': result_data.get('audioFile'),
                'voice_id': voice_id,
                'format': self.config['output_format']
            }
            
        except Exception as e:
            logger.error(f"Sync TTS generation failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'fallback_message': "Speech generation failed. Please try again."
            }
    
    async def get_available_voices(self) -> Dict[str, Any]:
        """
        Get list of available voices from Murf AI (async version)
        
        Returns:
            Dict containing available voices with detailed information
        """
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.config['base_url']}/voices",
                    headers=self.headers,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        raise Exception(f"Failed to fetch voices: {response.status}")
                        
        except Exception as e:
            logger.error(f"Failed to get voices: {str(e)}")
            # Return comprehensive default voice list
            return [
                {
                    'id': 'en-US-aileen',
                    'name': 'Aileen',
                    'language': 'en-US',
                    'gender': 'female',
                    'style': 'friendly',
                    'description': 'Warm, conversational female voice',
                    'sample_url': None
                },
                {
                    'id': 'en-US-adrian',
                    'name': 'Adrian',
                    'language': 'en-US',
                    'gender': 'male',
                    'style': 'professional',
                    'description': 'Clear, professional male voice',
                    'sample_url': None
                },
                {
                    'id': 'en-US-davis',
                    'name': 'Davis',
                    'language': 'en-US',
                    'gender': 'male',
                    'style': 'casual',
                    'description': 'Natural, conversational male voice',
                    'sample_url': None
                },
                {
                    'id': 'en-US-ken',
                    'name': 'Ken',
                    'language': 'en-US',
                    'gender': 'male',
                    'style': 'authoritative',
                    'description': 'Strong, confident male voice',
                    'sample_url': None
                },
                {
                    'id': 'en-US-sarah',
                    'name': 'Sarah',
                    'language': 'en-US',
                    'gender': 'female',
                    'style': 'energetic',
                    'description': 'Bright, energetic female voice',
                    'sample_url': None
                }
            ]
    
    def get_default_voice(self) -> str:
        """
        Get the default voice ID
        
        Returns:
            str: Default voice ID
        """
        return self.config['default_voice_id']
    
    def validate_text_length(self, text: str) -> bool:
        """
        Validate if text length is within acceptable limits
        
        Args:
            text (str): Text to validate
            
        Returns:
            bool: True if text length is acceptable
        """
        max_length = 5000  # Characters
        return len(text) <= max_length
    
    def estimate_audio_duration(self, text: str, speech_rate: float = 1.0) -> float:
        """
        Estimate audio duration based on text length and speech rate
        
        Args:
            text (str): Text to estimate duration for
            speech_rate (float): Speech rate multiplier
            
        Returns:
            float: Estimated duration in seconds
        """
        # Rough estimate: 150 words per minute for normal speech
        words = len(text.split())
        base_duration = (words / 150) * 60  # seconds
        return base_duration / speech_rate
    
    def preprocess_text(self, text: str) -> str:
        """
        Preprocess text for better TTS output
        
        Args:
            text (str): Raw text
            
        Returns:
            str: Preprocessed text
        """
        # Basic text cleaning and formatting
        text = text.strip()
        
        # Expand common abbreviations for better pronunciation
        replacements = {
            'AI': 'A I',
            'API': 'A P I',
            'TTS': 'Text to Speech',
            'STT': 'Speech to Text',
            'LLM': 'Large Language Model',
            'URL': 'U R L',
            'HTTP': 'H T T P'
        }
        
        for abbrev, expansion in replacements.items():
            text = text.replace(abbrev, expansion)
        
        # Ensure proper sentence endings
        if text and not text.endswith(('.', '!', '?')):
            text += '.'
        
        return text
    
    def get_service_status(self) -> Dict[str, Any]:
        """
        Get TTS service status and configuration
        
        Returns:
            Dict containing service status
        """
        try:
            # Test API connectivity
            test_response = requests.get(
                f"{self.config['base_url']}/voices",
                headers=self.headers,
                timeout=5
            )
            api_accessible = test_response.status_code == 200
            
        except Exception:
            api_accessible = False
        
        return {
            'service': 'Murf AI TTS',
            'status': 'active' if api_accessible else 'limited',
            'api_key_configured': bool(self.api_key),
            'default_voice': self.config['default_voice_id'],
            'output_format': self.config['output_format'],
            'speech_rate': self.config['speech_rate'],
            'api_accessible': api_accessible
        }
