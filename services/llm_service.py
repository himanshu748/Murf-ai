"""
Language Model Service using Perplexity AI
Handles intelligent conversation with context awareness
"""

import os
import logging
from typing import List, Dict, Optional
import aiohttp

from models.message_models import ServiceStatus

logger = logging.getLogger(__name__)

class LLMService:
    """Service for handling language model operations using Perplexity AI"""
    
    def __init__(self):
        self.api_key = os.getenv("PERPLEXITY_API_KEY")
        self.base_url = "https://api.perplexity.ai"
        
        if not self.api_key:
            logger.error("PERPLEXITY_API_KEY not found in environment variables")
            raise ValueError("Perplexity AI API key is required")
        
        # Default model configuration - Using Sonar model
        self.default_model = "sonar"
        self.max_tokens = 150
        self.temperature = 0.7
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # System prompt for voice agent
        self.system_prompt = """You are a helpful AI voice assistant. Keep your responses:
- Conversational and natural for voice interaction
- Concise but informative (1-3 sentences typically)
- Engaging and friendly in tone
- Relevant to the conversation context
- Easy to understand when spoken aloud

Remember this is a voice conversation, so avoid complex formatting, long lists, or overly technical language unless specifically requested."""
        
        logger.info("LLM Service initialized with Perplexity AI")
    
    def is_healthy(self) -> bool:
        """Check if the service is healthy"""
        return bool(self.api_key)
    
    async def get_response(
        self, 
        user_message: str, 
        chat_history: Optional[List[Dict[str, str]]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> Optional[str]:
        """
        Get AI response to user message with conversation context
        
        Args:
            user_message: User's input message
            chat_history: Previous conversation messages
            temperature: Response randomness (0.0 to 2.0)
            max_tokens: Maximum response length
            
        Returns:
            AI response text or None if failed
        """
        try:
            if not user_message or not user_message.strip():
                logger.warning("Empty user message provided to LLM")
                return None
            
            # Build messages array
            messages = [{"role": "system", "content": self.system_prompt}]
            
            # Add chat history with proper alternation
            if chat_history:
                # Keep last 8 messages for context (4 exchanges)
                recent_history = chat_history[-8:]
                
                # Ensure alternating pattern
                filtered_history = []
                last_role = "system"
                
                for msg in recent_history:
                    current_role = msg.get("role", "")
                    # Only add if it's different from the last role (ensures alternation)
                    if current_role != last_role and current_role in ["user", "assistant"]:
                        filtered_history.append(msg)
                        last_role = current_role
                
                messages.extend(filtered_history)
            
            # Add current user message (ensure it's different from last message)
            if not messages or messages[-1]["role"] != "user":
                messages.append({"role": "user", "content": user_message.strip()})
            
            # Log the message structure for debugging
            logger.debug(f"Sending {len(messages)} messages to Perplexity API")
            logger.debug(f"Message roles: {[msg.get('role') for msg in messages]}")
            
            # Prepare request payload
            payload = {
                "model": self.default_model,
                "messages": messages,
                "temperature": temperature or self.temperature,
                "max_tokens": max_tokens or self.max_tokens,
                "stream": False
            }
            
            # Make API request
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    headers=self.headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        
                        # Extract response text
                        choices = result.get("choices", [])
                        if choices and len(choices) > 0:
                            message = choices[0].get("message", {})
                            content = message.get("content", "").strip()
                            
                            if content:
                                logger.info(f"LLM response generated: {content[:100]}...")
                                return content
                            else:
                                logger.error("Empty content in LLM response")
                                return "I apologize, but I couldn't generate a proper response. Could you please try again?"
                        else:
                            logger.error("No choices in LLM response")
                            return "I'm having trouble processing your request right now. Please try again."
                    
                    elif response.status == 429:
                        logger.warning("Perplexity AI rate limit exceeded")
                        return "I'm currently experiencing high demand. Please try again in a moment."
                    
                    elif response.status == 401:
                        logger.error("Perplexity AI authentication failed")
                        return "I'm having authentication issues. Please contact support."
                    
                    else:
                        error_text = await response.text()
                        logger.error(f"Perplexity AI API error {response.status}: {error_text}")
                        return "I'm experiencing technical difficulties. Please try again later."
                        
        except aiohttp.ClientTimeout:
            logger.error("Perplexity AI API request timed out")
            return "I'm taking longer than usual to respond. Please try again."
        except Exception as e:
            logger.error(f"Error getting LLM response: {str(e)}")
            return "I encountered an unexpected error. Please try your request again."
    
    async def get_streaming_response(
        self, 
        user_message: str, 
        chat_history: Optional[List[Dict[str, str]]] = None
    ):
        """
        Get streaming AI response (for future implementation)
        
        Args:
            user_message: User's input message
            chat_history: Previous conversation messages
            
        Yields:
            Chunks of AI response
        """
        # Placeholder for streaming implementation
        # This would be useful for real-time response generation
        response = await self.get_response(user_message, chat_history)
        if response:
            yield response
    
    async def test_connection(self) -> bool:
        """
        Test connection to Perplexity AI
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            test_message = "Hello, can you hear me?"
            response = await self.get_response(test_message)
            
            if response and len(response) > 0:
                logger.info("LLM service test successful")
                return True
            else:
                logger.error("LLM service test failed - no response")
                return False
                
        except Exception as e:
            logger.error(f"LLM service test error: {str(e)}")
            return False
    
    def get_status(self) -> ServiceStatus:
        """Get service status"""
        return ServiceStatus(
            service_name="LLM (Perplexity AI)",
            is_healthy=self.is_healthy(),
            error_message=None if self.is_healthy() else "API key not configured"
        )
    
    def get_model_info(self) -> dict:
        """Get current model configuration"""
        return {
            "model": self.default_model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "provider": "Perplexity AI"
        }
    
    def update_system_prompt(self, new_prompt: str):
        """Update the system prompt"""
        self.system_prompt = new_prompt
        logger.info("System prompt updated")
    
    def get_conversation_summary(self, chat_history: List[Dict[str, str]]) -> str:
        """
        Generate a summary of the conversation (for long conversations)
        
        Args:
            chat_history: List of conversation messages
            
        Returns:
            Summary of the conversation
        """
        if not chat_history or len(chat_history) < 4:
            return "New conversation started."
        
        # Simple summary logic - in production, use LLM to generate summary
        user_messages = [msg["content"] for msg in chat_history if msg["role"] == "user"]
        assistant_messages = [msg["content"] for msg in chat_history if msg["role"] == "assistant"]
        
        return (f"Conversation with {len(user_messages)} user messages and "
                f"{len(assistant_messages)} assistant responses.")
    
    def format_for_voice(self, text: str) -> str:
        """
        Format text response for better voice synthesis
        
        Args:
            text: Original text
            
        Returns:
            Voice-optimized text
        """
        # Remove excessive punctuation and formatting
        formatted = text.replace("**", "").replace("*", "")
        formatted = formatted.replace("\n\n", ". ")
        formatted = formatted.replace("\n", " ")
        
        # Ensure proper sentence endings for natural speech
        if not formatted.endswith(('.', '!', '?')):
            formatted += "."
        
        return formatted.strip()
