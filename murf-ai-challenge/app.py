from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from pydantic import BaseModel
from typing import Optional
import requests
import asyncio
import httpx
import os
import uuid
import math
import tempfile
from datetime import datetime
import time
from dotenv import load_dotenv
from pathlib import Path
import logging
import assemblyai as aai

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from repository root .env (one level up from this file)
repo_root = Path(__file__).resolve().parents[1]
root_env_path = repo_root / ".env"
local_env_path = Path(__file__).with_name(".env")

if root_env_path.exists():
    load_dotenv(str(root_env_path))
elif local_env_path.exists():
    # Fallback to local .env if root not present
    load_dotenv(str(local_env_path))
else:
    # Fallback to default search path
    load_dotenv()

app = FastAPI(title="Voice Agents API", description="30 Days of Voice Agents - Day 7")

# Paths
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

# Mount static files for CSS and JS
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Cache for Murf voice selection to avoid repeated /voices lookups
_VOICE_CACHE: dict[str, dict] = {}
_VOICE_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours

class TTSRequest(BaseModel):
    text: str
    voice_id: str = "en-US-cooper"  # Updated to a valid voice ID from Murf API
    output_format: str = "mp3"

class EchoFastRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    output_format: str = "mp3"

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Serve the main HTML page via Jinja templates"""
    return templates.TemplateResponse("index.html", {"request": request})

# Removed explicit CSS/JS routes; served from /static

@app.get("/api/data")
async def data():
    """Basic API endpoint"""
    return {"message": "Hello, World!"}

@app.get("/api/voices")
async def get_voices():
    """Get available voices from Murf API"""
    try:
        # Get API key from environment
        api_key = os.getenv("MURF_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        # Murf API endpoint for voices
        url = "https://api.murf.ai/v1/speech/voices"
        
        # Request headers
        headers = {
            "api-key": api_key,
            "Content-Type": "application/json"
        }
        
        # Make request to Murf API
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            voices = response.json()
            return {
                "success": True,
                "voices": voices,
                "message": "Voices retrieved successfully"
            }
        else:
            error_detail = f"Murf API error (Status {response.status_code}): {response.text}"
            logger.error(error_detail)
            raise HTTPException(status_code=response.status_code, detail=error_detail)
            
    except requests.RequestException as e:
        error_msg = f"Request failed: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        error_msg = f"Internal server error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/tts/generate")
async def generate_tts(request: TTSRequest):
    """Generate TTS audio using Murf API"""
    try:
        # Get API key from environment
        api_key = os.getenv("MURF_API_KEY")
        logger.info(f"API key found: {'Yes' if api_key else 'No'}")
        
        if not api_key:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        # Murf API endpoint
        url = "https://api.murf.ai/v1/speech/generate"
        
        # Request headers
        headers = {
            "api-key": api_key,
            "Content-Type": "application/json"
        }
        
        # Request payload
        payload = {
            "text": request.text,
            "voiceId": request.voice_id,
            "outputFormat": request.output_format
        }
        
        logger.info(f"Making request to Murf API with payload: {payload}")
        
        # Make request to Murf API
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        logger.info(f"Murf API response status: {response.status_code}")
        logger.info(f"Murf API response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            
            # Check for audioFile (Murf API returns audioFile, not audioUrl)
            audio_url = result.get("audioFile")
            if audio_url:
                return {
                    "success": True,
                    "audio_url": audio_url,
                    "message": "TTS generated successfully",
                    "audio_length": result.get("audioLengthInSeconds", 0)
                }
            else:
                error_detail = "No audio URL found in response"
                logger.error(error_detail)
                raise HTTPException(status_code=500, detail=error_detail)
        else:
            error_detail = f"Murf API error (Status {response.status_code}): {response.text}"
            logger.error(error_detail)
            raise HTTPException(status_code=response.status_code, detail=error_detail)
            
    except requests.RequestException as e:
        error_msg = f"Request failed: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        error_msg = f"Internal server error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/upload/audio")
async def upload_audio_file(audio_file: UploadFile = File(...)):
    """Upload audio file and save it temporarily"""
    try:
        # Validate file type
        if not audio_file.content_type or not audio_file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="Only audio files are allowed")
        
        # Create uploads directory if it doesn't exist
        uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        file_extension = os.path.splitext(audio_file.filename)[1] if audio_file.filename else '.webm'
        filename = f"audio_{timestamp}_{unique_id}{file_extension}"
        
        # Save file to uploads directory
        file_path = os.path.join(uploads_dir, filename)
        
        with open(file_path, "wb") as buffer:
            content = await audio_file.read()
            buffer.write(content)
        
        # Get file size
        file_size = len(content)
        
        logger.info(f"Audio file uploaded successfully: {filename}, size: {file_size} bytes")
        
        return {
            "success": True,
            "filename": filename,
            "content_type": audio_file.content_type,
            "size": file_size,
            "size_formatted": format_file_size(file_size),
            "message": "Audio file uploaded successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to upload audio file: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

# Configure AssemblyAI
assemblyai_api_key = os.getenv("ASSEMBLYAI_API_KEY")
if not assemblyai_api_key:
    logger.warning("ASSEMBLYAI_API_KEY not found in environment variables. Transcription will not work.")
    transcriber = None
else:
    aai.settings.api_key = assemblyai_api_key
    transcriber = aai.Transcriber()

@app.post("/api/transcribe/file")
async def transcribe_audio_file(audio_file: UploadFile = File(...)):
    """Transcribe audio file using AssemblyAI"""
    try:
        # Check if AssemblyAI is configured
        if not transcriber:
            raise HTTPException(status_code=500, detail="AssemblyAI API key not configured. Please set ASSEMBLYAI_API_KEY environment variable.")
        
        # Validate file type
        if not audio_file.content_type or not audio_file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="Only audio files are allowed")
        
        logger.info(f"Starting transcription for file: {audio_file.filename}")

        # Read the audio file content
        audio_content = await audio_file.read()

        # Upload bytes directly to AssemblyAI (no local temp file)
        upload_url = upload_audio_to_assemblyai(audio_content)

        # Prefer fastest model if available; offload blocking call
        transcription_kwargs = {}
        try:
            cfg_kwargs = {}
            cfg_kwargs['speech_model'] = os.getenv('AAI_SPEECH_MODEL') or 'nano'
            if os.getenv('AAI_LANGUAGE_CODE'):
                cfg_kwargs['language_code'] = os.getenv('AAI_LANGUAGE_CODE')
            config = aai.TranscriptionConfig(**cfg_kwargs)
            transcription_kwargs['config'] = config
        except Exception:
            transcription_kwargs = {}

        transcript = await asyncio.to_thread(transcriber.transcribe, upload_url, **transcription_kwargs)

        if transcript.status == aai.TranscriptStatus.error:
            error_msg = f"Transcription failed: {transcript.error}"
            logger.error(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)

        # Extract the transcription text
        transcription_text = transcript.text

        logger.info(f"Transcription completed successfully. Length: {len(transcription_text)} characters")

        return {
            "success": True,
            "transcription": transcription_text,
            "confidence": transcript.confidence,
            "audio_duration": transcript.audio_duration,
            "words": len(transcript.words) if transcript.words else 0,
            "message": "Audio transcribed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to transcribe audio file: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

def format_file_size(size_bytes):
    """Format file size in human readable format"""
    if size_bytes == 0:
        return "0 Bytes"
    
    size_names = ["Bytes", "KB", "MB", "GB"]
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_names[i]}"

@app.post("/tts/echo")
async def tts_echo(
    audio_file: UploadFile = File(...),
    voice_id: str = "",  # Client value optional; server will choose an appropriate voice
    output_format: str = "mp3",
):
    """Echo Bot v2: Transcribe uploaded audio then synthesize with Murf voice.

    - Accepts an audio file upload
    - Transcribes using AssemblyAI
    - Generates TTS using Murf API with the provided voice
    - Returns the Murf audio URL and transcript
    """
    try:
        # Validate dependencies
        if not transcriber:
            raise HTTPException(status_code=500, detail="AssemblyAI API key not configured. Please set ASSEMBLYAI_API_KEY environment variable.")

        murf_api_key = os.getenv("MURF_API_KEY")
        if not murf_api_key:
            raise HTTPException(status_code=500, detail="Murf API key not configured. Please set MURF_API_KEY in the .env file.")

        # Validate file
        if not audio_file.content_type or not audio_file.content_type.startswith("audio/"):
            raise HTTPException(status_code=400, detail="Only audio files are allowed")

        logger.info(f"/tts/echo received file: name={audio_file.filename}, content_type={audio_file.content_type}")

        # Read content; upload to AssemblyAI (no disk I/O)
        audio_content = await audio_file.read()

        try:
            # Transcribe via upload URL (prefer fastest model) in a worker thread
            logger.info("Starting transcription for echo bot...")
            upload_url = await asyncio.to_thread(upload_audio_to_assemblyai, audio_content)
            transcription_kwargs = {}
            try:
                cfg_kwargs = {}
                cfg_kwargs['speech_model'] = os.getenv('AAI_SPEECH_MODEL') or 'nano'
                if os.getenv('AAI_LANGUAGE_CODE'):
                    cfg_kwargs['language_code'] = os.getenv('AAI_LANGUAGE_CODE')
                config = aai.TranscriptionConfig(**cfg_kwargs)
                transcription_kwargs['config'] = config
            except Exception:
                transcription_kwargs = {}

            transcript = await asyncio.to_thread(transcriber.transcribe, upload_url, **transcription_kwargs)

            if transcript.status == aai.TranscriptStatus.error:
                error_msg = f"Transcription failed: {transcript.error}"
                logger.error(error_msg)
                raise HTTPException(status_code=500, detail=error_msg)

            transcription_text = (transcript.text or "").strip()
            if not transcription_text:
                raise HTTPException(status_code=400, detail="Transcription was empty. Please speak clearly and try again.")

            logger.info(f"Transcription done. Text length: {len(transcription_text)}")

            # Decide voice to use (server-side preference: male voice, Indian if available)
            selected_voice_id = choose_male_voice_id(
                os.getenv("MURF_API_KEY"),
                preferred=os.getenv("MURF_DEFAULT_VOICE_ID") or voice_id,
                prefer_indian=True,
            )

            # Generate TTS via Murf
            murf_url = "https://api.murf.ai/v1/speech/generate"
            headers = {
                "api-key": murf_api_key,
                "Content-Type": "application/json",
            }
            payload = {
                "text": transcription_text,
                "voiceId": selected_voice_id,
                "outputFormat": output_format,
            }

            logger.info(f"Calling Murf generate with voice_id={selected_voice_id}, output_format={output_format}")
            async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0)) as client:
                murf_response = await client.post(murf_url, headers=headers, json=payload)
                status = murf_response.status_code
                logger.info(f"Murf API status: {status}")

                if status != 200:
                    detail = f"Murf API error (Status {status}): {murf_response.text}"
                    logger.error(detail)
                    raise HTTPException(status_code=status, detail=detail)

                murf_json = murf_response.json()
            audio_url = murf_json.get("audioFile") or murf_json.get("audioUrl")
            if not audio_url:
                raise HTTPException(status_code=500, detail="No audio URL found in Murf response")

            return {
                "success": True,
                "audio_url": audio_url,
                "transcript": transcription_text,
                "voice_id": selected_voice_id,
                "audio_length": murf_json.get("audioLengthInSeconds"),
                "message": "Echo generated successfully",
            }

        finally:
            pass

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unhandled error in /tts/echo")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


def upload_audio_to_assemblyai(audio_bytes: bytes) -> str:
    """Upload raw audio bytes to AssemblyAI and return its temporary upload URL."""
    api_key = os.getenv("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AssemblyAI API key not configured")
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/octet-stream",
    }
    try:
        resp = requests.post("https://api.assemblyai.com/v2/upload", headers=headers, data=audio_bytes, timeout=60)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"AssemblyAI upload error: {resp.text}")
        data = resp.json()
        upload_url = data.get("upload_url")
        if not upload_url:
            raise HTTPException(status_code=500, detail="AssemblyAI upload failed: missing upload_url")
        return upload_url
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AssemblyAI upload failed")
        raise HTTPException(status_code=500, detail=f"AssemblyAI upload failed: {str(e)}")


@app.post("/tts/echo-fast")
async def tts_echo_fast(req: EchoFastRequest):
    """Lower-latency path if client already has text. Skips transcription and just generates TTS.
    Useful for quick demos or when latency is a priority.
    """
    murf_api_key = os.getenv("MURF_API_KEY")
    if not murf_api_key:
        raise HTTPException(status_code=500, detail="Murf API key not configured.")

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    selected_voice_id = choose_male_voice_id(
        murf_api_key,
        preferred=os.getenv("MURF_DEFAULT_VOICE_ID") or req.voice_id or "",
        prefer_indian=True,
    )

    try:
        url = "https://api.murf.ai/v1/speech/generate"
        headers = {"api-key": murf_api_key, "Content-Type": "application/json"}
        payload = {"text": text, "voiceId": selected_voice_id, "outputFormat": req.output_format}
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Murf error: {resp.text}")
            data = resp.json()
            audio_url = data.get("audioFile") or data.get("audioUrl")
            if not audio_url:
                raise HTTPException(status_code=500, detail="No audio URL in Murf response")
            return {"success": True, "audio_url": audio_url, "voice_id": selected_voice_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("/tts/echo-fast error")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


def choose_male_voice_id(
    murf_api_key: str,
    preferred: Optional[str] = None,
    prefer_indian: bool = True,
) -> str:
    """Choose a male Murf voice. If preferred is provided, use it.
    If prefer_indian, try Indian male, else any male. Fallback to a generic male.
    """
    try:
        if preferred:
            return preferred
        if not murf_api_key:
            return "en-US-cooper"

        cache_key = f"male_voice_indian_{prefer_indian}"
        cached = _VOICE_CACHE.get(cache_key)
        now = time.time()
        if cached and (now - cached.get("ts", 0)) < _VOICE_CACHE_TTL_SECONDS:
            return cached["voice_id"]

        url = "https://api.murf.ai/v1/speech/voices"
        headers = {"api-key": murf_api_key, "Content-Type": "application/json"}
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return "en-US-cooper"
        data = resp.json()
        voices = data.get("voices") if isinstance(data, dict) else data
        if not isinstance(voices, list):
            return "en-US-cooper"

        def is_indian(v: dict) -> bool:
            lid = str(v.get("languageId") or v.get("language") or "").lower()
            name = str(v.get("name") or "").lower()
            return any(k in lid for k in ["en-in", "hi", "hi-in", "india"]) or any(k in name for k in ["hindi", "indian"])

        def gender_of(v: dict) -> str:
            return str(v.get("gender") or "").lower()

        # Try Indian male first if requested
        if prefer_indian:
            indian = [v for v in voices if isinstance(v, dict) and is_indian(v) and gender_of(v).startswith("m")]
            if indian:
                for v in indian:
                    lid = str(v.get("languageId") or v.get("language") or "").lower()
                    if "en-in" in lid:
                        vid = str(v.get("id") or v.get("voiceId") or v.get("code") or v.get("name"))
                        _VOICE_CACHE[cache_key] = {"voice_id": vid, "ts": now}
                        return vid
                v = indian[0]
                vid = str(v.get("id") or v.get("voiceId") or v.get("code") or v.get("name"))
                _VOICE_CACHE[cache_key] = {"voice_id": vid, "ts": now}
                return vid

        # Else pick any male
        male = [v for v in voices if isinstance(v, dict) and gender_of(v).startswith("m")]
        if male:
            vid = str(male[0].get("id") or male[0].get("voiceId") or male[0].get("code") or male[0].get("name"))
            _VOICE_CACHE[cache_key] = {"voice_id": vid, "ts": now}
            return vid

        return "en-US-cooper"
    except Exception:
        return "en-US-cooper"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
