from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import httpx
import base64

from config import get_settings
from services import llm, tts
from services.murf_ws import MurfWsClient

# -----------------------------------------------------------------------------
# Logging & App Setup
# -----------------------------------------------------------------------------

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("murf-ai")

app = FastAPI(title="Murf AI Conversational Bot")

BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
RECORDINGS_DIR = BASE_DIR / "recordings"
UPLOADS_DIR = BASE_DIR / "uploads"

for d in [TEMPLATES_DIR, STATIC_DIR, RECORDINGS_DIR, UPLOADS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

settings = get_settings()
MAX_HISTORY = settings.MAX_CHAT_HISTORY

# -----------------------------------------------------------------------------
# In-memory Session Store
# -----------------------------------------------------------------------------

class Session:
    def __init__(self, sid: str):
        self.id = sid
        self.history: List[Dict[str, str]] = []  # [{role, content}]
        self.streaming_mode: bool = True
        self.audio_file_path: Optional[Path] = None
        self.audio_bytes: int = 0
        self.audio_chunks: int = 0
        self.audio_started_at: Optional[float] = None
        self.current_llm_task: Optional[asyncio.Task] = None
        # Murf WS client and static context for this session
        self.murf_client: Optional[MurfWsClient] = None
        self.murf_context_id: str = f"ctx_{sid}"

SESSIONS: Dict[str, Session] = {}


def get_or_create_session(sid: Optional[str]) -> Session:
    if not sid:
        sid = str(uuid.uuid4())
    if sid not in SESSIONS:
        SESSIONS[sid] = Session(sid)
    return SESSIONS[sid]


def _append_history_with_trim(session: Session, role: str, content: str) -> None:
    session.history.append({"role": role, "content": content})
    # Trim to last MAX_HISTORY messages
    if MAX_HISTORY > 0 and len(session.history) > MAX_HISTORY:
        # Keep only the tail
        session.history = session.history[-MAX_HISTORY:]


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request, session: Optional[str] = None):
    sid = session or str(uuid.uuid4())
    # Pre-create session so UI can connect with it
    get_or_create_session(sid)
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "session_id": sid},
    )


@app.get("/health")
async def health():
    status = {
        "server": "ok",
        "murf_api_key": bool(settings.MURF_API_KEY),
        "assemblyai_api_key": bool(settings.ASSEMBLYAI_API_KEY),
        "perplexity_api_key": bool(settings.PERPLEXITY_API_KEY),
    }
    return JSONResponse(status)

@app.get("/assemblyai/token")
async def assemblyai_token():
    """Mint a short-lived token for AssemblyAI Realtime WS.

    This avoids exposing the long-lived API key to the browser.
    """
    if not settings.ASSEMBLYAI_API_KEY:
        return JSONResponse({"error": "missing_assemblyai_api_key"}, status_code=400)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://streaming.assemblyai.com/v3/token",
                headers={
                    "Authorization": settings.ASSEMBLYAI_API_KEY,
                },
                params={
                    "expires_in_seconds": 600,
                    "max_session_duration_seconds": 3600,
                },
            )
            if resp.status_code != 200:
                logger.error("Failed to mint AssemblyAI token: %s %s", resp.status_code, resp.text)
                return JSONResponse({
                    "error": "aai_token_failed",
                    "upstream_status": resp.status_code,
                    "upstream_body": resp.text,
                }, status_code=resp.status_code)
            data = resp.json()
            # Expected: {"token": "...", "expires_at": "..."}
            return JSONResponse(data)
    except Exception as e:
        logger.exception("Error requesting AssemblyAI token")
        return JSONResponse({"error": "aai_token_exception", "detail": str(e)}, status_code=500)


@app.get("/session/new")
async def new_session():
    sid = str(uuid.uuid4())
    get_or_create_session(sid)
    return {"session": sid}


@app.get("/session/{session_id}/history")
async def session_history(session_id: str):
    s = get_or_create_session(session_id)
    return {"session": session_id, "history": s.history}


@app.delete("/session/{session_id}")
async def delete_session(session_id: str):
    try:
        SESSIONS.pop(session_id, None)
        return {"status": "deleted", "session": session_id}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# -----------------------------------------------------------------------------
# WebSocket: Real-time streaming & Day 19 LLM token streaming
# -----------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Read session from query params
    query = websocket.query_params
    session_qp: Optional[str] = query.get("session") or query.get("session_id")
    session = get_or_create_session(session_qp)

    logger.info("WS connected: session=%s", session.id)

    try:
        while True:
            message = await websocket.receive()

            if "text" in message and message["text"] is not None:
                # JSON control/message frames
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "invalid_json",
                    }))
                    continue

                msg_type = payload.get("type")

                if msg_type == "echo":
                    await websocket.send_text(json.dumps({"type": "echo", "data": payload.get("data")}))

                elif msg_type == "session_create":
                    session = get_or_create_session(None)
                    await websocket.send_text(json.dumps({"type": "session_created", "session": session.id}))

                elif msg_type == "session_join":
                    requested = payload.get("session")
                    session = get_or_create_session(requested)
                    await websocket.send_text(json.dumps({"type": "session_joined", "session": session.id}))

                elif msg_type == "streaming_mode":
                    on = bool(payload.get("on", True))
                    session.streaming_mode = on
                    await websocket.send_text(json.dumps({"type": "streaming_mode", "on": session.streaming_mode}))

                elif msg_type == "text_message":
                    text = payload.get("text", "").strip()
                    if not text:
                        continue

                    _append_history_with_trim(session, "user", text)

                    # Cancel existing LLM task if running
                    if session.current_llm_task and not session.current_llm_task.done():
                        session.current_llm_task.cancel()

                    # Spawn background task to stream LLM tokens (Day 19)
                    session.current_llm_task = asyncio.create_task(
                        _stream_llm_and_emit(websocket, session, text)
                    )

                elif msg_type == "turn_end":
                    # When STT signals end of user turn, run LLM on transcript
                    transcript = payload.get("transcript", "").strip()
                    if transcript:
                        _append_history_with_trim(session, "user", transcript)
                        if session.current_llm_task and not session.current_llm_task.done():
                            session.current_llm_task.cancel()
                        session.current_llm_task = asyncio.create_task(
                            _stream_llm_and_emit(websocket, session, transcript)
                        )

                else:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"unknown_type:{msg_type}",
                    }))

            elif "bytes" in message and message["bytes"] is not None:
                # Binary audio chunk during streaming mode
                data: bytes = message["bytes"]
                if session.streaming_mode:
                    if session.audio_file_path is None:
                        session.audio_started_at = time.time()
                        filename = f"stream_{session.id}_{int(session.audio_started_at)}.webm"
                        session.audio_file_path = RECORDINGS_DIR / filename
                        # Ensure file exists
                        session.audio_file_path.parent.mkdir(parents=True, exist_ok=True)
                        with open(session.audio_file_path, "wb") as f:
                            pass

                    with open(session.audio_file_path, "ab") as f:
                        f.write(data)

                    session.audio_chunks += 1
                    session.audio_bytes += len(data)

                    duration = 0.0
                    if session.audio_started_at:
                        duration = time.time() - session.audio_started_at

                    # Emit progress to client
                    await websocket.send_text(json.dumps({
                        "type": "streaming_progress",
                        "chunks": session.audio_chunks,
                        "bytes": session.audio_bytes,
                        "duration": round(duration, 2),
                    }))

            else:
                # No text or bytes, ignore
                pass

    except WebSocketDisconnect:
        logger.info("WS disconnected: session=%s", session.id)
        # Cleanup Murf client if active
        try:
            if session.murf_client:
                await session.murf_client.close()
        except Exception:
            logger.exception("Error closing Murf client on disconnect")
    except Exception:
        logger.exception("WS error: session=%s", session.id)
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": "server_error"}))
        except Exception:
            pass
        # Attempt Murf cleanup
        try:
            if session.murf_client:
                await session.murf_client.close()
        except Exception:
            pass


async def _stream_llm_and_emit(ws: WebSocket, session: Session, prompt: str):
    """Stream LLM tokens to client without blocking WS receive loop."""
    logger.info("[Day 19] Start LLM stream: session=%s", session.id)
    assembled: List[str] = []
    send_lock = asyncio.Lock()

    try:
        # Initialize Murf WS once per session if API key is configured
        use_murf = bool(settings.MURF_API_KEY)
        if use_murf and session.murf_client is None:
            try:
                session.murf_client = MurfWsClient(settings.MURF_API_KEY)
                await session.murf_client.connect()
                # Start the receiver loop which logs base64 audio to console
                # and forward the base64 chunks to the browser client.
                async def _on_audio_chunk(b64: str, payload: dict) -> None:
                    try:
                        async with send_lock:
                            await ws.send_text(json.dumps({
                                "type": "audio_chunk",
                                "b64": b64,
                                "final": bool(payload.get("final")),
                                "context_id": payload.get("context_id"),
                            }))
                    except Exception:
                        logger.exception("Failed to forward audio chunk to client")
                await session.murf_client.start_receiver(on_audio_chunk=_on_audio_chunk)
                # If voice config JSON is provided, send it once
                if getattr(settings, "MURF_VOICE_CONFIG_JSON", None):
                    try:
                        cfg = json.loads(settings.MURF_VOICE_CONFIG_JSON)
                        await session.murf_client.send_voice_config(cfg)
                        logger.info("[MurfWS] voice_config sent")
                    except Exception:
                        logger.exception("[MurfWS] Failed to send voice_config from env")
            except Exception:
                logger.exception("Failed to initialize Murf WS client; falling back to local TTS only")
                session.murf_client = None

        # For a new assistant turn, clear previous Murf context (while keeping static context_id)
        try:
            if session.murf_client is not None:
                await session.murf_client.send_text(session.murf_context_id, "", clear=True)
        except Exception:
            logger.exception("Failed to clear Murf context before streaming")

        async for token in llm.stream_chat(prompt, history=session.history):
            # Log token to server console (Day 19 requirement)
            logger.info("[LLM token] %s", token)
            assembled.append(token)
            # Emit token to client
            try:
                async with send_lock:
                    await ws.send_text(json.dumps({"type": "llm_token", "token": token}))
            except RuntimeError:
                # WS might be closed; stop streaming
                logger.warning("WebSocket closed while streaming tokens")
                break
            # Forward token to Murf WS using a static context_id
            try:
                if session.murf_client is not None:
                    await session.murf_client.send_text(session.murf_context_id, token)
            except Exception:
                logger.exception("Failed to forward token to Murf WS")

        final_text = "".join(assembled)
        logger.info("[LLM complete] %s", final_text)
        _append_history_with_trim(session, "assistant", final_text)
        try:
            async with send_lock:
                await ws.send_text(json.dumps({"type": "llm_complete", "text": final_text}))
        except RuntimeError:
            logger.warning("WebSocket closed before sending completion")

        # Signal end of Murf context so it can finalize audio
        try:
            if session.murf_client is not None:
                await session.murf_client.send_text(session.murf_context_id, "", end=True)
                # Optionally wait briefly for Murf to mark final
                asyncio.create_task(session.murf_client.wait_for_final(session.murf_context_id, timeout=5.0))
        except Exception:
            logger.exception("Failed to send end signal to Murf WS")

        # After completion, synthesize TTS and send to client (fallback MP3 for now)
        try:
            audio_bytes = await tts.synthesize(final_text)
            if audio_bytes:
                b64 = base64.b64encode(audio_bytes).decode("ascii")
                try:
                    async with send_lock:
                        await ws.send_text(json.dumps({
                            "type": "tts_audio",
                            "mime": "audio/mpeg",
                            "b64": b64,
                        }))
                except RuntimeError:
                    logger.warning("WebSocket closed before sending TTS audio")
        except Exception:
            logger.exception("TTS synthesis failed")

    except asyncio.CancelledError:
        logger.info("LLM streaming task cancelled: session=%s", session.id)
        raise
    except Exception:
        logger.exception("Error during LLM streaming: session=%s", session.id)
        try:
            await ws.send_text(json.dumps({"type": "error", "message": "llm_stream_failed"}))
        except Exception:
            pass
