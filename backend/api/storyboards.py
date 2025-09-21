"""
Storyboard generation API endpoints
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
from prompt_manager import prompt_manager, storyboard_prompt
import httpx
import json
import os

router = APIRouter(prefix="/api", tags=["storyboards"])
logger = logging.getLogger(__name__)

# API Configuration
API_KEY = os.getenv("GEMINI_API_KEY", "")
TEXT_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={API_KEY}"

# Pydantic Models
class StoryboardGenerationRequest(BaseModel):
    script: str
    templateType: Optional[str] = None
    panelCount: int = 8

class StoryAnalysisRequest(BaseModel):
    panels: List[Dict[str, Any]]

class ScriptRefinementRequest(BaseModel):
    natural_language: str

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

# API Endpoints
@router.post("/generate-storyboard")
async def generate_storyboard(request: StoryboardGenerationRequest):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    try:
        logger.info(f"Generating storyboard for template: {request.templateType}")

        if request.templateType:
            # Use template-based generation
            system_prompt, user_request, schema = storyboard_prompt.create_prompt(
                request.templateType,
                request.script,
                request.panelCount
            )
        else:
            # Default script analysis
            variables = {"script": request.script}
            system_prompt = prompt_manager.get_system_prompt('script_analysis', variables)
            user_request = prompt_manager.render_template('script_analysis', variables)
            schema = prompt_manager.get_response_schema('script_analysis')

        payload = {
            "contents": [{"parts": [{"text": user_request}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema
            }
        }

        result = await call_api(TEXT_API_URL, payload)
        json_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")

        if not json_text:
            raise HTTPException(status_code=500, detail="AI returned an empty response")

        panels = json.loads(json_text)
        return {"panels": panels}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storyboard generation failed: {str(e)}")

@router.post("/analyze-story")
async def analyze_story(request: StoryAnalysisRequest):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    if len(request.panels) < 3:
        raise HTTPException(status_code=400, detail="Need at least 3 panels to perform story analysis")

    try:
        logger.info(f"Analyzing story with {len(request.panels)} panels")

        # Build script from panels
        full_script = "\n\n".join([
            f"Panel {i + 1}:\nPROMPT: {panel.get('prompt', 'N/A')}\nAUDIO: {panel.get('audio', 'N/A')}"
            for i, panel in enumerate(request.panels)
        ])

        # Use LangChain prompt management
        variables = {"storyboard_script": full_script}
        system_prompt = prompt_manager.get_system_prompt('story_analysis', variables)
        user_prompt = prompt_manager.render_template('story_analysis', variables)

        payload = {
            "contents": [{"parts": [{"text": user_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]}
        }

        result = await call_api(TEXT_API_URL, payload)
        analysis_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

        return {"analysis": analysis_text}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Story analysis failed: {str(e)}")

@router.post("/refine-script")
async def refine_script(request: ScriptRefinementRequest):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not configured")

    if not request.natural_language.strip():
        raise HTTPException(status_code=400, detail="Natural language description is required")

    try:
        logger.info(f"Refining natural language to script: {request.natural_language[:50]}...")

        # Use LangChain prompt management for script refinement
        variables = {"natural_language": request.natural_language}
        system_prompt = prompt_manager.get_system_prompt('script_refinement', variables)
        user_prompt = prompt_manager.render_template('script_refinement', variables)

        payload = {
            "contents": [{"parts": [{"text": user_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]}
        }

        result = await call_api(TEXT_API_URL, payload)
        refined_script = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

        if not refined_script:
            raise HTTPException(status_code=500, detail="AI returned an empty script")

        return {"refined_script": refined_script}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Script refinement failed: {str(e)}")