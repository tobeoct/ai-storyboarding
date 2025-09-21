"""
Image generation API endpoints
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
from prompt_manager import prompt_manager, image_prompt
import httpx
import json
import base64
import io
from PIL import Image
import os

router = APIRouter(prefix="/api", tags=["images"])
logger = logging.getLogger(__name__)

# API Configuration
API_KEY = os.getenv("GEMINI_API_KEY", "")
IMAGE_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key={API_KEY}"
TEXT_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={API_KEY}"

# Pydantic Models
class ImageGenerationRequest(BaseModel):
    prompt: str
    style: str = "Cinematic Realism"
    cinematography: Dict[str, str] = {}
    refPrev: bool = False
    previousImageUrl: Optional[str] = None
    styleImageBase64: Optional[str] = None
    styleImageMimeType: Optional[str] = None
    assetImages: List[Dict[str, str]] = []
    # Add consistency parameters
    projectStyleId: Optional[str] = None
    maintainConsistency: bool = True

    class Config:
        json_schema_extra = {
            "example": {
                "prompt": "A wide shot of a futuristic city",
                "style": "Cinematic Realism",
                "cinematography": {
                    "lens": "wide",
                    "lighting": "cinematic"
                }
            }
        }

class StyleGenerationRequest(BaseModel):
    style: str

class StyleAnalysisRequest(BaseModel):
    image_base64: str
    mime_type: str

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

def crop_image_to_16_9(image_base64: str) -> str:
    """Crop image to 16:9 aspect ratio using center crop as fallback"""
    try:
        # Decode base64 image
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))

        # Calculate 16:9 crop dimensions
        target_aspect_ratio = 16 / 9
        width, height = image.size

        if width / height > target_aspect_ratio:
            # Image is too wide
            new_width = int(height * target_aspect_ratio)
            left = (width - new_width) // 2
            crop_box = (left, 0, left + new_width, height)
        else:
            # Image is too tall
            new_height = int(width / target_aspect_ratio)
            top = (height - new_height) // 2
            crop_box = (0, top, width, top + new_height)

        cropped_image = image.crop(crop_box)

        # Convert back to base64
        buffer = io.BytesIO()
        cropped_image.save(buffer, format='JPEG', quality=90)
        cropped_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return f"data:image/jpeg;base64,{cropped_base64}"

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image cropping failed: {str(e)}")

# Style consistency management
style_sessions = {}

def get_or_create_style_session(project_style_id: str, base_style: str, style_image: dict = None) -> dict:
    """Get or create a style session for consistency"""
    if project_style_id not in style_sessions:
        style_sessions[project_style_id] = {
            "base_style": base_style,
            "style_image": style_image,
            "generated_images": [],
            "style_keywords": [],
            "consistency_prompt": ""
        }
    return style_sessions[project_style_id]

def build_consistency_prompt(style_session: dict, new_prompt: str) -> str:
    """Build a prompt that maintains visual consistency"""
    base_style = style_session["base_style"]
    consistency_elements = []

    # Add style keywords from previous generations
    if style_session["style_keywords"]:
        consistency_elements.append(f"Maintain consistent style elements: {', '.join(style_session['style_keywords'])}")

    # Add reference to visual consistency
    if len(style_session["generated_images"]) > 0:
        consistency_elements.append("Maintain visual consistency with previous panels in this sequence")

    # Combine elements
    if consistency_elements:
        consistency_text = " " + ". ".join(consistency_elements) + "."
    else:
        consistency_text = ""

    return f"Style: {base_style}. {new_prompt}{consistency_text}"

# API Endpoints
@router.post("/generate-image")
async def generate_image(request: ImageGenerationRequest):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    try:
        # Log request size for debugging
        request_size = len(str(request.dict()))
        logger.info(f"Generating image for prompt: {request.prompt[:50]}... (Request size: {request_size / 1024:.1f}KB)")

        # Validate request size
        if request_size > 45 * 1024 * 1024:  # 45MB limit
            raise HTTPException(
                status_code=413,
                detail="Request too large. Please reduce image sizes or number of assets."
            )

        # Handle style consistency
        if request.maintainConsistency and request.projectStyleId:
            style_session = get_or_create_style_session(
                request.projectStyleId,
                request.style,
                {"base64": request.styleImageBase64, "mimeType": request.styleImageMimeType} if request.styleImageBase64 else None
            )

            # Use LangChain prompt management with consistency
            final_prompt = image_prompt.create_prompt(
                prompt=request.prompt,
                style=request.style,
                cinematography=request.cinematography,
                use_previous_context=request.refPrev and request.previousImageUrl is not None
            )

            # Add consistency elements
            if len(style_session["generated_images"]) > 0:
                final_prompt += " Maintain visual consistency with the established style and cinematography of this sequence."
        else:
            # Standard generation without consistency
            final_prompt = image_prompt.create_prompt(
                prompt=request.prompt,
                style=request.style,
                cinematography=request.cinematography,
                use_previous_context=request.refPrev and request.previousImageUrl is not None
            )

        logger.info(f"Generated prompt: {final_prompt}")

        # Build parts for API call
        parts = [{"text": final_prompt}]

        # Add asset images
        for asset in request.assetImages:
            parts.append({
                "inlineData": {
                    "mimeType": asset["mimeType"],
                    "data": asset["base64"]
                }
            })

        # Add style reference image
        if request.styleImageBase64:
            parts.append({
                "inlineData": {
                    "mimeType": request.styleImageMimeType,
                    "data": request.styleImageBase64
                }
            })

        # Add previous frame reference
        if request.refPrev and request.previousImageUrl:
            try:
                # Extract base64 from data URL
                header, base64_data = request.previousImageUrl.split(',', 1)
                mime_type = header.split(';')[0].split(':')[1]
                parts.append({
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": base64_data
                    }
                })
            except Exception as e:
                logger.warning(f"Failed to process previous image: {e}")

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE"]}
        }

        result = await call_api(IMAGE_API_URL, payload)

        # Extract image data
        base64_data = None
        for part in result.get("candidates", [{}])[0].get("content", {}).get("parts", []):
            if "inlineData" in part:
                base64_data = part["inlineData"]["data"]
                break

        if not base64_data:
            raise HTTPException(status_code=500, detail="No image data received from API")

        # Crop to 16:9 and return
        cropped_image_url = crop_image_to_16_9(base64_data)

        # Update style session for consistency
        if request.maintainConsistency and request.projectStyleId:
            style_session["generated_images"].append({
                "prompt": request.prompt,
                "image_url": cropped_image_url,
                "cinematography": request.cinematography
            })

        return {"imageUrl": cropped_image_url}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

@router.post("/generate-suggestions")
async def generate_suggestions(request: dict):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    prompt = request.get("prompt", "")
    if not prompt:
        return {"suggestions": []}

    try:
        logger.info(f"Generating suggestions for: {prompt[:50]}...")

        # Use LangChain prompt management
        variables = {"current_shot": prompt}
        user_prompt = prompt_manager.render_template('shot_suggestions', variables)
        response_schema = prompt_manager.get_response_schema('shot_suggestions')

        payload = {
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": response_schema
            }
        }

        result = await call_api(TEXT_API_URL, payload)
        suggestions_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
        suggestions = json.loads(suggestions_text)

        return {"suggestions": suggestions}

    except Exception as e:
        logger.error(f"Error generating suggestions: {e}")
        return {"suggestions": []}

@router.post("/generate-style")
async def generate_style(request: StyleGenerationRequest):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    try:
        logger.info(f"Generating style reference for: {request.style}")

        # Use LangChain prompt management
        variables = {"style": request.style}
        style_prompt = prompt_manager.render_template('style_generation', variables)

        payload = {
            "contents": [{"parts": [{"text": style_prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]}
        }

        result = await call_api(IMAGE_API_URL, payload)

        base64_data = None
        for part in result.get("candidates", [{}])[0].get("content", {}).get("parts", []):
            if "inlineData" in part:
                base64_data = part["inlineData"]["data"]
                break

        if not base64_data:
            raise HTTPException(status_code=500, detail="No image data received")

        return {
            "base64": base64_data,
            "mimeType": "image/png",
            "dataUrl": f"data:image/png;base64,{base64_data}"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Style generation failed: {str(e)}")

@router.post("/analyze-style")
async def analyze_style(request: StyleAnalysisRequest):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    try:
        logger.info(f"Analyzing style from uploaded image")

        # Use LangChain prompt management
        variables = {
            "image_data": request.image_base64,
            "mime_type": request.mime_type
        }

        system_prompt = prompt_manager.get_system_prompt('style_analysis', variables)
        user_prompt = prompt_manager.render_template('style_analysis', variables)
        response_schema = prompt_manager.get_response_schema('style_analysis')

        # Build parts for API call with image
        parts = [
            {"text": user_prompt},
            {
                "inlineData": {
                    "mimeType": request.mime_type,
                    "data": request.image_base64
                }
            }
        ]

        payload = {
            "contents": [{"parts": parts}],
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": response_schema
            }
        }

        result = await call_api(TEXT_API_URL, payload)
        analysis_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")

        try:
            analysis_data = json.loads(analysis_text)
            return analysis_data
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            return {
                "style_description": "Custom uploaded style",
                "style_name": "Custom Style",
                "characteristics": {
                    "medium": "Unknown",
                    "color_palette": "Varied",
                    "lighting": "Mixed",
                    "texture": "Original"
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Style analysis failed: {e}")
        # Return fallback response
        return {
            "style_description": "Custom uploaded style",
            "style_name": "Custom Style",
            "characteristics": {
                "medium": "Unknown",
                "color_palette": "Varied",
                "lighting": "Mixed",
                "texture": "Original"
            }
        }

# Style session management endpoints
@router.post("/create-style-session")
async def create_style_session(request: dict):
    """Create a new style session for consistency tracking"""
    project_id = request.get("projectId")
    base_style = request.get("baseStyle", "Cinematic Realism")
    style_image = request.get("styleImage")

    if not project_id:
        raise HTTPException(status_code=400, detail="Project ID required")

    style_sessions[project_id] = {
        "base_style": base_style,
        "style_image": style_image,
        "generated_images": [],
        "style_keywords": [],
        "consistency_prompt": ""
    }

    return {"sessionId": project_id, "status": "created"}

@router.get("/style-session/{project_id}")
async def get_style_session(project_id: str):
    """Get current style session state"""
    if project_id not in style_sessions:
        raise HTTPException(status_code=404, detail="Style session not found")

    return style_sessions[project_id]

@router.delete("/style-session/{project_id}")
async def clear_style_session(project_id: str):
    """Clear style session for fresh start"""
    if project_id in style_sessions:
        del style_sessions[project_id]

    return {"status": "cleared"}