"""
Mobile Gateway Router
=====================
Handles audio upload and processing for mobile clients (/mobile/v1/conversations/upload).
Includes audio format conversion to standardized 16kHz mono WAV format.
"""

import json
import logging
import os
import uuid as uuid_mod
import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from backend.database import save_conversation
from backend.orchestrator import PipelineOrchestrator
from backend.schemas import MobileUploadResponse
from backend.insight_postprocess import normalize_card_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mobile/v1/conversations", tags=["mobile"])

# Lazy-load orchestrator on first request to avoid slow /docs endpoint
_orchestrator = None

def get_orchestrator():
    """Get or create the orchestrator instance (lazy loading)."""
    global _orchestrator
    if _orchestrator is None:
        logger.info("Initializing PipelineOrchestrator on first request...")
        _orchestrator = PipelineOrchestrator()
    return _orchestrator


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _conv_to_response(conv) -> dict:
    """Convert a database Conversation ORM object into response dict."""
    entities = None
    if conv.entities_json:
        try:
            entities = json.loads(conv.entities_json)
        except (json.JSONDecodeError, TypeError):
            entities = {"raw": conv.entities_json}

    summary = None
    if conv.summary_json:
        try:
            summary = json.loads(conv.summary_json)
        except (json.JSONDecodeError, TypeError):
            summary = {"raw": conv.summary_json}

    normalized = normalize_card_payload(
        raw_transcript=conv.raw_transcript,
        entities=entities,
        summary=summary,
        confidence_score=conv.confidence_score,
        flagged_for_review=conv.flagged_for_review,
    )

    return {
        "id": conv.id,
        "timestamp": conv.timestamp.isoformat() if conv.timestamp else None,
        "languages_detected": conv.languages_detected,
        "raw_transcript": normalized["raw_transcript"],
        "entities": normalized["entities"],
        "summary": normalized["summary"],
        "confidence_score": normalized["confidence_score"],
        "confidence_explanation": normalized["summary"].get("confidence_explanation", ""),
        "flagged_for_review": normalized["flagged_for_review"],
    }


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    response_model=MobileUploadResponse,
    summary="Upload and process audio from mobile client",
)
async def upload_audio(
    file: UploadFile = File(None),
    audio_file: UploadFile = File(None),
):
    """
    Accept audio file upload from mobile client.
    Pass directly to pipeline (ASR engine handles conversion).
    Supports: .wav, .mp3, .m4a, .ogg, .aac
    """
    uploaded_file = file or audio_file
    if not uploaded_file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided.",
        )
    
    # Read file content
    content = await uploaded_file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    
    try:
        import tempfile
        from pathlib import Path
        
        # Save uploaded audio to temp file for ASR engine
        temp_dir = Path(tempfile.gettempdir()) / "integration_armour_audio"
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        chunk_id = str(uuid_mod.uuid4())

        # Preserve source container extension for more reliable decoding.
        source_name = uploaded_file.filename or "audio"
        detected_suffix = Path(source_name).suffix.lower()
        if not detected_suffix:
            guessed_suffix = mimetypes.guess_extension(uploaded_file.content_type or "")
            detected_suffix = guessed_suffix.lower() if guessed_suffix else ".bin"

        temp_audio_path = temp_dir / f"chunk_{chunk_id}{detected_suffix}"
        with open(temp_audio_path, "wb") as f:
            f.write(content)

        # Pass directly to pipeline (ASR engine will handle format)
        audio_chunk = {
            "audio_bytes": content,
            "audio_path": str(temp_audio_path),  # ASR engine will use this for processing
            "chunk_id": chunk_id,
            "sample_rate": 16000,
            "filename": uploaded_file.filename or "audio",
            "content_type": uploaded_file.content_type,
            "duration": len(content) / (16000 * 2),
        }
        
        logger.info(f"Processing audio: {uploaded_file.filename} ({len(content)} bytes)")
        
        # Run through pipeline
        insight_card = get_orchestrator().process(audio_chunk)
        
        # Persist to database
        conv = save_conversation(
            languages_detected=insight_card.get("language_detected", "unknown"),
            raw_transcript=insight_card.get("raw_transcript", ""),
            entities_json=json.dumps(insight_card.get("entities", {})),
            summary_json=json.dumps({
                "topic": insight_card.get("topic", "unknown"),
                "amount_discussed": insight_card.get("amount_discussed", "unknown"),
                "decision": insight_card.get("decision", "unknown"),
                "sentiment": insight_card.get("sentiment", "neutral"),
                "next_action": insight_card.get("next_action", "unknown"),
                "confidence_explanation": insight_card.get("confidence_explanation", ""),
            }),
            confidence_score=float(insight_card.get("confidence_score", 0.0)),
            flagged_for_review=bool(insight_card.get("flagged_for_review", False)),
        )
        
        logger.info(f"Conversation saved: {conv.id}")
        
        return MobileUploadResponse(
            success=True,
            conversation_id=conv.id,
            message="Audio processed successfully",
            data=_conv_to_response(conv),
        )
    
    except Exception as e:
        logger.error(f"Error processing audio: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process audio: {str(e)}",
        )
