from __future__ import annotations

import asyncio
import json
import logging
import base64
from pathlib import Path
from typing import AsyncGenerator, Optional

import websockets

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def synthesize(text: str) -> bytes:
    """Generate speech audio for the assistant reply.

    If Murf API integration is configured, this is where it would be called.
    For now, return a bundled fallback MP3 so playback works end-to-end.
    """
    logger.info("[TTS] Synthesizing %d chars", len(text))

    # TODO: Integrate Murf TTS using settings.MURF_API_KEY. Keep secure.

    # Fallback: return the bundled static MP3 so UI can play audio.
    try:
        base_dir = Path(__file__).resolve().parent.parent
        fallback_path = base_dir / "static" / "fallback.mp3"
        if fallback_path.exists():
            return fallback_path.read_bytes()
    except Exception:
        logger.exception("[TTS] Failed to read fallback audio")

    # If anything fails, return empty bytes
    return b""


async def stream_synthesize(text: str, voice_id: str = "en-US-amara") -> AsyncGenerator[dict, None]:
    """Stream TTS audio from Murf API in real-time chunks.
    
    Yields audio chunks as they arrive from Murf WebSocket API.
    Each yielded dict contains: {'audio': base64_audio_data, 'final': boolean}
    """
    if not settings.MURF_API_KEY:
        logger.warning("[TTS] No Murf API key configured, falling back to mock streaming")
        # Mock streaming for testing - yield fake chunks
        import time
        for i in range(3):
            await asyncio.sleep(0.5)  # Simulate network delay
            yield {
                "audio": "mock_audio_chunk_" + str(i),
                "final": i == 2
            }
        return

    logger.info("[TTS] Starting streaming synthesis for %d chars with voice %s", len(text), voice_id)
    
    try:
        # Connect to Murf WebSocket API
        ws_url = f"wss://api.murf.ai/v1/speech/stream-input?api-key={settings.MURF_API_KEY}&sample_rate=44100&channel_type=MONO&format=WAV"
        
        async with websockets.connect(ws_url) as ws:
            # Send voice configuration first
            voice_config = {
                "voice_config": {
                    "voiceId": voice_id,
                    "style": "Conversational",
                    "rate": 0,
                    "pitch": 0,
                    "variation": 1,
                    "sampleRate": 44100,
                    "format": "WAV",
                    "channelType": "MONO",
                    "encodeAsBase64": True
                }
            }
            
            logger.debug("[TTS] Sending voice config: %s", voice_config)
            await ws.send(json.dumps(voice_config))
            
            # Send text to synthesize
            text_message = {
                "text": text,
                "end": True  # Close context for concurrency
            }
            
            logger.debug("[TTS] Sending text: %s", text_message)
            await ws.send(json.dumps(text_message))
            
            # Receive and yield audio chunks
            while True:
                try:
                    response = await ws.recv()
                    data = json.loads(response)
                    
                    logger.debug("[TTS] Received data: %s", {k: v for k, v in data.items() if k != 'audio'})
                    
                    if "audio" in data:
                        # Yield audio chunk
                        chunk = {
                            "audio": data["audio"],
                            "final": data.get("final", False)
                        }
                        yield chunk
                        
                        # If this is the final chunk, break
                        if data.get("final", False):
                            logger.info("[TTS] Received final audio chunk")
                            break
                            
                except websockets.exceptions.ConnectionClosed:
                    logger.info("[TTS] WebSocket connection closed")
                    break
                except json.JSONDecodeError as e:
                    logger.warning("[TTS] Failed to parse JSON response: %s", e)
                    continue
                except Exception as e:
                    logger.error("[TTS] Error receiving audio chunk: %s", e)
                    break
                    
    except Exception as e:
        logger.exception("[TTS] Failed to connect to Murf WebSocket: %s", e)
        return
