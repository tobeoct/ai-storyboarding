"""
Audio generation API endpoints
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import logging
import httpx
import base64
import io
import os

router = APIRouter(prefix="/api", tags=["audio"])
logger = logging.getLogger(__name__)

# API Configuration
API_KEY = os.getenv("GEMINI_API_KEY", "")
TTS_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key={API_KEY}"

# Pydantic Models
class AudioGenerationRequest(BaseModel):
    text: str

# Helper Functions
async def call_api(url: str, payload: dict) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=60.0
        )
        if not response.is_success:
            error_detail = response.text
            try:
                error_json = response.json()
                error_detail = error_json.get("error", {}).get("message", error_detail)
            except:
                pass
            raise HTTPException(status_code=response.status_code, detail=error_detail)
        return response.json()

def pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000) -> bytes:
    """Convert PCM data to WAV format"""
    import struct

    # WAV header
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm_data)

    header = struct.pack('<4sI4s4sIHHIIHH4sI',
                        b'RIFF',
                        36 + data_size,
                        b'WAVE',
                        b'fmt ',
                        16,
                        1,
                        num_channels,
                        sample_rate,
                        byte_rate,
                        block_align,
                        bits_per_sample,
                        b'data',
                        data_size)

    return header + pcm_data

# API Endpoints
@router.post("/generate-audio")
async def generate_audio(request: AudioGenerationRequest):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required for audio generation")

    try:
        logger.info(f"Generating audio for text: {request.text[:50]}...")

        payload = {
            "contents": [{"parts": [{"text": request.text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"]},
            "model": "gemini-2.5-flash-preview-tts"
        }

        result = await call_api(TTS_API_URL, payload)

        audio_data = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("inlineData", {}).get("data")
        mime_type = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("inlineData", {}).get("mimeType")

        if not audio_data or not mime_type or not mime_type.startswith("audio/"):
            raise HTTPException(status_code=500, detail="Invalid audio data received")

        # Extract sample rate from mime type or use default
        sample_rate = 24000
        if "rate=" in mime_type:
            try:
                sample_rate = int(mime_type.split("rate=")[1].split(";")[0])
            except:
                pass

        # Convert PCM to WAV
        pcm_data = base64.b64decode(audio_data)
        wav_data = pcm_to_wav(pcm_data, sample_rate)

        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(wav_data),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=audio.wav"}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio generation failed: {str(e)}")