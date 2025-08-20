from __future__ import annotations

import logging

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class StreamingSTT:
    """Placeholder for AssemblyAI streaming STT integration.

    For Day 17/18, you would connect to AssemblyAI Realtime API here,
    forward audio chunks, and surface partial/final transcripts plus
    end-of-turn events.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id

    async def start(self) -> None:
        logger.info("[STT] Starting streaming session: %s", self.session_id)

    async def stop(self) -> None:
        logger.info("[STT] Stopping streaming session: %s", self.session_id)

    async def send_audio(self, chunk: bytes) -> None:
        logger.debug("[STT] Received audio chunk: bytes=%d", len(chunk))

    # You would also define callbacks / async generators to yield STT events
