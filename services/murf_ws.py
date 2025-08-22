from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional, Callable, Awaitable, Dict

from config import get_settings

try:
    import websockets
    from websockets.legacy.client import WebSocketClientProtocol
except Exception as e:  # pragma: no cover - optional dependency might be missing at import time
    websockets = None  # type: ignore
    WebSocketClientProtocol = object  # type: ignore


logger = logging.getLogger(__name__)
settings = get_settings()


class MurfWsClient:
    """Minimal Murf TTS WebSocket client focused on piping text and logging base64 audio.

    Usage:
        async with MurfWsClient(api_key) as client:
            await client.start_receiver()
            await client.send_text(ctx_id, "hello")
            await client.send_text(ctx_id, "world", end=True)
            await client.wait_for_final(ctx_id)
    """

    BASE_URL = "wss://api.murf.ai/v1/speech/stream-input"

    def __init__(
        self,
        api_key: str,
        sample_rate: int = 44100,
        channel_type: str = "MONO",
        audio_format: str = "WAV",
    ) -> None:
        if not api_key:
            raise RuntimeError("MURF_API_KEY not configured")
        if websockets is None:  # pragma: no cover
            raise RuntimeError(
                "The 'websockets' package is required. Please add it to requirements and install."
            )
        self.api_key = api_key
        self.sample_rate = sample_rate
        self.channel_type = channel_type
        self.audio_format = audio_format

        self.ws: Optional[WebSocketClientProtocol] = None
        self._recv_task: Optional[asyncio.Task] = None
        self._final_events: Dict[str, asyncio.Event] = {}
        self._closed = False

    async def __aenter__(self) -> "MurfWsClient":
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    async def connect(self) -> None:
        url = (
            f"{self.BASE_URL}?api-key={self.api_key}"
            f"&sample_rate={self.sample_rate}"
            f"&channel_type={self.channel_type}"
            f"&format={self.audio_format}"
        )
        logger.info("[MurfWS] Connecting %s", url.replace(self.api_key, "***"))
        self.ws = await websockets.connect(url, max_queue=None)  # type: ignore

    async def close(self) -> None:
        self._closed = True
        try:
            if self._recv_task and not self._recv_task.done():
                self._recv_task.cancel()
        except Exception:
            pass
        try:
            if self.ws:
                await self.ws.close()
        except Exception:
            pass
        self.ws = None

    async def start_receiver(
        self,
        on_audio_chunk: Optional[Callable[[str, dict], Awaitable[None]]] = None,
    ) -> None:
        if not self.ws:
            raise RuntimeError("WebSocket not connected")
        if self._recv_task and not self._recv_task.done():
            return

        async def _recv_loop() -> None:
            try:
                while not self._closed and self.ws:
                    raw = await self.ws.recv()
                    try:
                        payload = json.loads(raw)
                    except Exception:
                        logger.debug("[MurfWS] Non-JSON frame: %s", type(raw))
                        continue

                    ctx = payload.get("context_id")
                    if "audio" in payload:
                        b64 = payload.get("audio")
                        # Print the base64 audio to the console, as requested
                        logger.info("[MurfWS audio base64] %s", b64)
                        if on_audio_chunk:
                            try:
                                await on_audio_chunk(b64, payload)
                            except Exception:
                                logger.exception("[MurfWS] on_audio_chunk failed")
                    if payload.get("final") is True and ctx:
                        ev = self._final_events.get(ctx)
                        if ev:
                            ev.set()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("[MurfWS] Receiver loop error")

        self._recv_task = asyncio.create_task(_recv_loop())

    async def send_voice_config(self, voice_config: dict) -> None:
        if not self.ws:
            raise RuntimeError("WebSocket not connected")
        msg = {"voice_config": voice_config}
        await self.ws.send(json.dumps(msg))

    async def send_text(self, context_id: str, text: str, end: bool = False, clear: bool = False) -> None:
        if not self.ws:
            raise RuntimeError("WebSocket not connected")
        msg = {"context_id": context_id}
        if text:
            msg["text"] = text
        if end:
            msg["end"] = True
        if clear:
            msg["clear"] = True
        await self.ws.send(json.dumps(msg))

    async def wait_for_final(self, context_id: str, timeout: float = 10.0) -> bool:
        ev = self._final_events.get(context_id)
        if ev is None:
            ev = asyncio.Event()
            self._final_events[context_id] = ev
        try:
            await asyncio.wait_for(ev.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False
