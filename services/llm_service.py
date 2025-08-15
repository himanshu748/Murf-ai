"""
Large Language Model Service using Perplexity AI
Day 14 Refactored Module
"""

import os
import logging
import requests
import json
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

class LLMService:
    """Perplexity AI Large Language Model Service"""
    
    def __init__(self):
        """Initialize LLM service with Perplexity AI configuration"""
        self.api_key = os.getenv('PERPLEXITY_API_KEY')
        if not self.api_key:
            raise ValueError("PERPLEXITY_API_KEY not found in environment variables")
        
        # Service configuration
        self.config = {
            'base_url': os.getenv('PERPLEXITY_API_BASE_URL', 'https://api.perplexity.ai'),
            'model': os.getenv('LLM_MODEL', 'llama-3.1-sonar-small-128k-online'),
            'temperature': float(os.getenv('LLM_TEMPERATURE', '0.7')),
            'max_tokens': int(os.getenv('LLM_MAX_TOKENS', '150')),
            'system_prompt': os.getenv('LLM_SYSTEM_PROMPT', 
                'You are a helpful AI assistant. Keep responses concise and conversational for voice interactions.')
        }
        
        # Request headers
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'Murf-AI-Bot/1.0'
        }
        
        logger.info(f"LLM Service initialized with model: {self.config['model']}")
    
    async def generate_response(self, user_message: str, chat_history: List[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Generate response using Perplexity AI with chat history context
        
        Args:
            user_message (str): Current user message
            chat_history (List[Dict], optional): Previous conversation messages
            
        Returns:
            Dict containing LLM response and metadata
        """
        try:
            logger.info(f"Generating LLM response for: '{user_message[:100]}{'...' if len(user_message) > 100 else ''}'")
            
            # Build messages array with chat history
            messages = []
            
            # Add system prompt
            messages.append({
                'role': 'system',
                'content': self.config['system_prompt']
            })
            
            # Add chat history if provided
            if chat_history:
                for msg in chat_history[-10:]:  # Limit to last 10 messages
                    if msg.get('role') and msg.get('content'):
                        messages.append({
                            'role': msg['role'],
                            'content': msg['content']
                        })
            
            # Add current user message
            messages.append({
                'role': 'user',
                'content': user_message
            })
            
            # Prepare request payload
            payload = {
                'model': self.config['model'],
                'messages': messages,
                'temperature': self.config['temperature'],
                'max_tokens': self.config['max_tokens'],
                'stream': False
            }
            
            # Make API request
            response = requests.post(
                f"{self.config['base_url']}/chat/completions",
                json=payload,
                headers=self.headers,
                timeout=30
            )
            
            # Check response status
            if response.status_code != 200:
                raise Exception(f"Perplexity API error {response.status_code}: {response.text}")
            
            # Parse response
            result_data = response.json()
            
            if 'choices' not in result_data or not result_data['choices']:
                raise Exception("No response choices returned from Perplexity API")
            
            # Extract response text
            assistant_message = result_data['choices'][0]['message']['content']
            
            # Prepare result
            result = {
                'success': True,
                'response': assistant_message,
                'model': self.config['model'],
                'tokens_used': result_data.get('usage', {}).get('total_tokens', 0),
                'finish_reason': result_data['choices'][0].get('finish_reason', 'completed'),
                'message_count': len(messages)
            }
            
            logger.info(f"LLM response generated successfully: '{assistant_message[:100]}{'...' if len(assistant_message) > 100 else ''}'")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"LLM network error: {str(e)}")
            return {
                'success': False,
                'error': f"Network error: {str(e)}",
                'response': "I'm having trouble connecting to my knowledge base right now. Please try again.",
                'fallback_message': "I'm having trouble connecting right now. Please try again."
            }
        except Exception as e:
            logger.error(f"LLM generation failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'response': "I'm experiencing technical difficulties. Please try asking your question again.",
                'fallback_message': "I'm having trouble processing your request right now."
            }
    
    def generate_response_sync(self, user_message: str, chat_history: List[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Synchronous version of response generation (legacy support)
        
        Args:
            user_message (str): Current user message
            chat_history (List[Dict], optional): Previous conversation messages
            
        Returns:
            Dict containing LLM response
        """
        try:
            messages = [{'role': 'system', 'content': self.config['system_prompt']}]
            
            if chat_history:
                for msg in chat_history[-10:]:
                    if msg.get('role') and msg.get('content'):
                        messages.append(msg)
            
            messages.append({'role': 'user', 'content': user_message})
            
            payload = {
                'model': self.config['model'],
                'messages': messages,
                'temperature': self.config['temperature'],
                'max_tokens': self.config['max_tokens'],
                'stream': False
            }
            
            response = requests.post(
                f"{self.config['base_url']}/chat/completions",
                json=payload,
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code != 200:
                raise Exception(f"Perplexity API error {response.status_code}: {response.text}")
            
            result_data = response.json()
            assistant_message = result_data['choices'][0]['message']['content']
            
            return {
                'success': True,
                'response': assistant_message,
                'model': self.config['model']
            }
            
        except Exception as e:
            logger.error(f"Sync LLM generation failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'response': "I'm having trouble right now. Please try again.",
                'fallback_message': "I'm experiencing technical difficulties."
            }
    
    def format_chat_history(self, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        Format chat history for API consumption
        
        Args:
            messages (List[Dict]): Raw chat history
            
        Returns:
            List[Dict]: Formatted messages for API
        """
        formatted_messages = []
        
        for msg in messages:
            if 'role' in msg and 'content' in msg:
                # Ensure role is valid
                if msg['role'] in ['user', 'assistant', 'system']:
                    formatted_messages.append({
                        'role': msg['role'],
                        'content': str(msg['content']).strip()
                    })
        
        return formatted_messages
    
    def optimize_for_voice(self, text: str) -> str:
        """
        Optimize response text for voice output
        
        Args:
            text (str): Original response text
            
        Returns:
            str: Voice-optimized text
        """
        # Remove markdown formatting
        text = text.replace('**', '').replace('*', '').replace('`', '')
        
        # Replace common symbols for better speech
        replacements = {
            '&': 'and',
            '@': 'at',
            '#': 'number',
            '$': 'dollars',
            '%': 'percent',
            '+': 'plus',
            '=': 'equals',
            '<': 'less than',
            '>': 'greater than'
        }
        
        for symbol, word in replacements.items():
            text = text.replace(symbol, word)
        
        # Ensure proper sentence endings
        sentences = text.split('. ')
        optimized_sentences = []
        
        for sentence in sentences:
            sentence = sentence.strip()
            if sentence and not sentence.endswith(('.', '!', '?')):
                sentence += '.'
            optimized_sentences.append(sentence)
        
        return ' '.join(optimized_sentences)
    
    def validate_message_length(self, message: str) -> bool:
        """
        Validate if message length is within acceptable limits
        
        Args:
            message (str): Message to validate
            
        Returns:
            bool: True if message length is acceptable
        """
        max_length = 2000  # Characters
        return len(message) <= max_length
    
    def get_conversation_summary(self, chat_history: List[Dict[str, str]]) -> str:
        """
        Generate a summary of the conversation for context management
        
        Args:
            chat_history (List[Dict]): Chat history messages
            
        Returns:
            str: Conversation summary
        """
        if not chat_history:
            return "New conversation started."
        
        message_count = len(chat_history)
        user_messages = [msg for msg in chat_history if msg.get('role') == 'user']
        
        if message_count <= 2:
            return f"Brief conversation with {len(user_messages)} user messages."
        else:
            return f"Ongoing conversation with {len(user_messages)} user messages and {message_count - len(user_messages)} responses."
    
    def get_service_status(self) -> Dict[str, Any]:
        """
        Get LLM service status and configuration
        
        Returns:
            Dict containing service status
        """
        try:
            # Test API connectivity with a simple request
            test_payload = {
                'model': self.config['model'],
                'messages': [{'role': 'user', 'content': 'Hello'}],
                'max_tokens': 5
            }
            
            test_response = requests.post(
                f"{self.config['base_url']}/chat/completions",
                json=test_payload,
                headers=self.headers,
                timeout=10
            )
            api_accessible = test_response.status_code == 200
            
        except Exception:
            api_accessible = False
        
        return {
            'service': 'Perplexity AI LLM',
            'status': 'active' if api_accessible else 'limited',
            'api_key_configured': bool(self.api_key),
            'model': self.config['model'],
            'temperature': self.config['temperature'],
            'max_tokens': self.config['max_tokens'],
            'api_accessible': api_accessible
        }
