"""
Real-time Speech-to-Text Service using AssemblyAI Python SDK
Day 17: Handles streaming audio transcription with real-time processing
"""

import os
import logging
import asyncio
import threading
from typing import Optional, Callable, Dict, Any
from datetime import datetime
import assemblyai as aai

logger = logging.getLogger(__name__)

class StreamingSTTService:
    """Service for handling real-time speech-to-text operations using AssemblyAI SDK"""
    
    def __init__(self):
        self.api_key = os.getenv("ASSEMBLYAI_API_KEY")
        
        if not self.api_key:
            logger.error("ASSEMBLYAI_API_KEY not found in environment variables")
            raise ValueError("AssemblyAI API key is required")
        
        # Configure AssemblyAI
        aai.settings.api_key = self.api_key
        
        # Streaming configuration for 16kHz, 16-bit, mono PCM
        self.sample_rate = 16000  # 16kHz
        self.word_boost = ["um", "uh", "AI", "API"]  # Boost common filler words and technical terms
        
        self.transcriber = None
        self.is_streaming = False
        self.session_transcriptions: Dict[str, list] = {}
        
        logger.info("Streaming STT Service initialized with AssemblyAI SDK")
    
    def is_healthy(self) -> bool:
        """Check if the service is healthy"""
        return bool(self.api_key)
    
    async def start_streaming_session(
        self, 
        session_id: str, 
        on_partial_transcript: Optional[Callable] = None,
        on_final_transcript: Optional[Callable] = None,
        on_error: Optional[Callable] = None,
        on_turn_detected: Optional[Callable] = None,
        end_of_turn_confidence_threshold: float = 0.7,
        min_end_of_turn_silence_when_confident: int = 160,
        max_turn_silence: int = 2400
    ) -> bool:
        """
        Start a new streaming transcription session
        
        Args:
            session_id: Unique identifier for the session
            on_partial_transcript: Callback for partial transcriptions
            on_final_transcript: Callback for final transcriptions
            on_error: Callback for errors
            
        Returns:
            True if session started successfully
        """
        try:
            # Initialize session storage
            self.session_transcriptions[session_id] = []
            
            # Capture current running loop for thread-safe callback scheduling
            try:
                event_loop = asyncio.get_running_loop()
            except RuntimeError:
                event_loop = None

            # Create transcriber with callbacks
            # Note: Turn detection support varies by SDK version. We expose config params
            # and additionally surface a synthetic 'turn_detected' event on final transcripts.
            try:
                # Newer SDKs may support config object
                self.transcriber = aai.RealtimeTranscriber(
                    sample_rate=self.sample_rate,
                    word_boost=self.word_boost,
                    on_data=self._create_data_callback(
                        session_id,
                        on_partial_transcript,
                        on_final_transcript,
                        on_turn_detected,
                        event_loop,
                    ),
                    on_error=self._create_error_callback(session_id, on_error, event_loop),
                    end_of_turn_confidence_threshold=end_of_turn_confidence_threshold,
                    min_end_of_turn_silence_when_confident=min_end_of_turn_silence_when_confident,
                    max_turn_silence=max_turn_silence,
                )
            except TypeError:
                # Fallback for older SDKs without explicit turn detection params
                self.transcriber = aai.RealtimeTranscriber(
                    sample_rate=self.sample_rate,
                    word_boost=self.word_boost,
                    on_data=self._create_data_callback(
                        session_id,
                        on_partial_transcript,
                        on_final_transcript,
                        on_turn_detected,
                        event_loop,
                    ),
                    on_error=self._create_error_callback(session_id, on_error, event_loop),
                )
            
            # Start transcriber in a separate thread
            def start_transcriber():
                try:
                    self.transcriber.connect()
                    self.is_streaming = True
                    logger.info(f"Started streaming transcription for session: {session_id}")
                except Exception as e:
                    logger.error(f"Error starting transcriber: {str(e)}")
                    self.is_streaming = False
            
            thread = threading.Thread(target=start_transcriber)
            thread.daemon = True
            thread.start()
            
            # Wait a moment for connection to establish
            await asyncio.sleep(0.5)
            
            return self.is_streaming
            
        except Exception as e:
            logger.error(f"Error starting streaming session: {str(e)}")
            return False
    
    def _create_data_callback(self, session_id: str, on_partial: Optional[Callable], on_final: Optional[Callable], on_turn_detected: Optional[Callable], event_loop: Optional[asyncio.AbstractEventLoop]):
        """Create data callback for transcription results"""
        def on_data(transcript: aai.RealtimeTranscript):
            try:
                timestamp = datetime.utcnow().isoformat()
                
                if transcript.message_type == "PartialTranscript":
                    # Handle partial transcript
                    if transcript.text and transcript.text.strip():
                        logger.debug(f"Partial transcript [{session_id}]: {transcript.text}")
                        
                        # Store partial transcript
                        partial_data = {
                            "type": "partial",
                            "text": transcript.text,
                            "confidence": getattr(transcript, 'confidence', 0.0),
                            "timestamp": timestamp,
                            "session_id": session_id
                        }
                        
                        if on_partial:
                            try:
                                # Run callback in thread-safe manner
                                if event_loop and event_loop.is_running():
                                    event_loop.call_soon_threadsafe(asyncio.create_task, on_partial(partial_data))
                                else:
                                    asyncio.create_task(on_partial(partial_data))
                            except Exception as e:
                                logger.error(f"Error in partial transcript callback: {str(e)}")
                
                elif transcript.message_type == "FinalTranscript":
                    # Handle final transcript
                    if transcript.text and transcript.text.strip():
                        logger.info(f"Final transcript [{session_id}]: {transcript.text}")
                        
                        # Store final transcript
                        final_data = {
                            "type": "final",
                            "text": transcript.text,
                            "confidence": getattr(transcript, 'confidence', 0.0),
                            "timestamp": timestamp,
                            "session_id": session_id
                        }
                        
                        # Add to session history
                        self.session_transcriptions[session_id].append(final_data)
                        
                        # Print to console (Day 17 requirement)
                        print(f"\n🎤 TRANSCRIPTION [{session_id}] [{timestamp}]:")
                        print(f"📝 Text: {transcript.text}")
                        print(f"📊 Confidence: {getattr(transcript, 'confidence', 'N/A')}")
                        print("-" * 60)
                        
                        if on_final:
                            try:
                                # Run callback in thread-safe manner
                                if event_loop and event_loop.is_running():
                                    event_loop.call_soon_threadsafe(asyncio.create_task, on_final(final_data))
                                else:
                                    asyncio.create_task(on_final(final_data))
                            except Exception as e:
                                logger.error(f"Error in final transcript callback: {str(e)}")
                        
                        # Emit synthetic turn detection event on each final transcript
                        if on_turn_detected:
                            try:
                                turn_data = {
                                    "session_id": session_id,
                                    "text": transcript.text,
                                    "timestamp": timestamp,
                                }
                                if event_loop and event_loop.is_running():
                                    event_loop.call_soon_threadsafe(asyncio.create_task, on_turn_detected(turn_data))
                                else:
                                    asyncio.create_task(on_turn_detected(turn_data))
                            except Exception as e:
                                logger.error(f"Error in turn detected callback: {str(e)}")
                        
            except Exception as e:
                logger.error(f"Error processing transcript data: {str(e)}")
        
        return on_data
    
    def _create_error_callback(self, session_id: str, on_error: Optional[Callable], event_loop: Optional[asyncio.AbstractEventLoop] = None):
        """Create error callback for transcription errors"""
        def on_error_internal(error: aai.RealtimeError):
            try:
                error_msg = f"Transcription error [{session_id}]: {error}"
                logger.error(error_msg)
                
                # Print to console
                print(f"\n❌ TRANSCRIPTION ERROR [{session_id}]:")
                print(f"🚨 Error: {error}")
                print("-" * 60)
                
                if on_error:
                    try:
                        error_data = {
                            "session_id": session_id,
                            "error": str(error),
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        if event_loop and event_loop.is_running():
                            event_loop.call_soon_threadsafe(asyncio.create_task, on_error(error_data))
                        else:
                            asyncio.create_task(on_error(error_data))
                    except Exception as e:
                        logger.error(f"Error in error callback: {str(e)}")
                        
            except Exception as e:
                logger.error(f"Error in error callback processing: {str(e)}")
        
        return on_error_internal
    
    async def stream_audio_chunk(self, session_id: str, audio_data: bytes) -> bool:
        """
        Stream audio chunk for real-time transcription
        
        Args:
            session_id: Session identifier
            audio_data: Raw audio data in bytes (should be 16kHz, 16-bit, mono PCM)
            
        Returns:
            True if chunk was processed successfully
        """
        try:
            if not self.is_streaming or not self.transcriber:
                logger.warning(f"No active transcriber for session {session_id}")
                return False
            
            # Send audio data to transcriber with method fallbacks
            sent = False
            try:
                # Preferred method name in many SDK versions
                self.transcriber.stream(audio_data)
                sent = True
            except Exception as e1:
                try:
                    # Alternate method name
                    self.transcriber.send_audio(audio_data)
                    sent = True
                except Exception as e2:
                    try:
                        # Generic send fallback
                        self.transcriber.send(audio_data)
                        sent = True
                    except Exception as e3:
                        logger.error(f"All send methods failed: stream={e1}, send_audio={e2}, send={e3}")
                        return False
            
            logger.debug(f"Streamed {len(audio_data)} bytes to transcriber for session {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error streaming audio chunk: {str(e)}")
            return False
    
    async def stop_streaming_session(self, session_id: str) -> Dict[str, Any]:
        """
        Stop streaming transcription session
        
        Args:
            session_id: Session identifier
            
        Returns:
            Session summary with transcription results
        """
        try:
            if self.transcriber:
                self.transcriber.close()
                self.is_streaming = False
                logger.info(f"Stopped streaming transcription for session: {session_id}")
            
            # Get session transcriptions
            transcriptions = self.session_transcriptions.get(session_id, [])
            
            # Create summary
            summary = {
                "session_id": session_id,
                "total_transcriptions": len(transcriptions),
                "transcriptions": transcriptions,
                "ended_at": datetime.utcnow().isoformat()
            }
            
            # Print summary to console
            print(f"\n🏁 TRANSCRIPTION SESSION ENDED [{session_id}]:")
            print(f"📋 Total transcriptions: {len(transcriptions)}")
            if transcriptions:
                print("📝 Final transcriptions:")
                for i, trans in enumerate(transcriptions, 1):
                    print(f"  {i}. {trans['text']} (confidence: {trans.get('confidence', 'N/A')})")
            print("=" * 60)
            
            # Clean up session data
            if session_id in self.session_transcriptions:
                del self.session_transcriptions[session_id]
            
            return summary
            
        except Exception as e:
            logger.error(f"Error stopping streaming session: {str(e)}")
            return {
                "session_id": session_id,
                "error": str(e),
                "ended_at": datetime.utcnow().isoformat()
            }
    
    def get_session_transcriptions(self, session_id: str) -> list:
        """Get all transcriptions for a session"""
        return self.session_transcriptions.get(session_id, [])
    
    def get_status(self) -> dict:
        """Get service status"""
        return {
            "service_name": "Streaming STT (AssemblyAI SDK)",
            "is_healthy": self.is_healthy(),
            "is_streaming": self.is_streaming,
            "active_sessions": list(self.session_transcriptions.keys()),
            "error_message": None if self.is_healthy() else "API key not configured"
        }
