from __future__ import annotations

import logging
from pathlib import Path

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
