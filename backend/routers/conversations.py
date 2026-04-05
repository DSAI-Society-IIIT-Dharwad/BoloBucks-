"""
Conversations Router
====================
CRUD + pipeline-processing endpoints for conversation records.
"""

import json
import logging
import mimetypes
import uuid as uuid_mod
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from backend.database import (
    save_conversation,
    get_all_conversations,
    get_conversation,
    update_conversation,
    delete_conversation,
)
from backend.orchestrator import PipelineOrchestrator
from backend.schemas import InsightCardResponse, ConversationUpdateBody
from backend.insight_postprocess import normalize_card_payload
from audio_processor import AudioProcessor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])

# Lazy-load orchestrator on first request to avoid slow /docs endpoint
_orchestrator = None

def get_orchestrator():
    """Get or create the orchestrator instance (lazy loading)."""
    global _orchestrator
    if _orchestrator is None:
        logger.info("Initializing PipelineOrchestrator on first request...")
        _orchestrator = PipelineOrchestrator()
    return _orchestrator


# ─── Validation helpers ──────────────────────────────────────────────────────

def _validate_uuid(conv_id: str) -> str:
    """Raise 400 if conv_id is not a valid UUID string."""
    try:
        uuid_mod.UUID(conv_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid UUID format: '{conv_id}'.",
        )
    return conv_id


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _conv_to_card(conv) -> dict:
    """Convert a database Conversation ORM object into an InsightCard dict."""
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
    "/process",
    status_code=status.HTTP_201_CREATED,
    response_model=InsightCardResponse,
    summary="Process an audio file through the full pipeline",
)
async def process_audio(
    file: UploadFile = File(None),
    audio_file: UploadFile = File(None),
):
    """
    Accept an audio file upload, run it through ASR → NLP → Insight,
    persist the result, and return the InsightCard.
    """
    import uuid as uuid_mod
    
    uploaded_file = file or audio_file
    if not uploaded_file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided.",
        )

    content = await uploaded_file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # Use correct format for ASR engine - save audio to file for ASR processing
    import tempfile
    
    temp_dir = Path(tempfile.gettempdir()) / "integration_armour_audio"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    chunk_id = str(uuid_mod.uuid4())
    source_name = uploaded_file.filename or "audio"
    detected_suffix = Path(source_name).suffix.lower()
    if not detected_suffix:
        guessed_suffix = mimetypes.guess_extension(uploaded_file.content_type or "")
        detected_suffix = guessed_suffix.lower() if guessed_suffix else ".bin"

    temp_audio_path = temp_dir / f"chunk_{chunk_id}{detected_suffix}"
    with open(temp_audio_path, "wb") as f:
        f.write(content)

    converted_audio_path = temp_audio_path
    if temp_audio_path.suffix.lower() != ".wav":
        converted_audio_path, _ = AudioProcessor.convert_to_target_format(
            str(temp_audio_path),
            chunk_id,
        )
    
    audio_chunk = {
        "audio_bytes": content,
        "audio_path": converted_audio_path,  # ASR engine expects file path
        "chunk_id": chunk_id,
        "sample_rate": 16000,
        "filename": uploaded_file.filename,
        "content_type": uploaded_file.content_type,
        "duration": len(content) / (16000 * 2),
    }

    # Run the pipeline (never raises)
    insight_card = get_orchestrator().process(audio_chunk)

    # Persist to DB
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

    return _conv_to_card(conv)


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    response_model=List[InsightCardResponse],
    summary="List all conversations",
)
async def list_conversations():
    """Return all conversations sorted by timestamp DESC."""
    conversations = get_all_conversations()
    return [_conv_to_card(c) for c in conversations]


@router.get(
    "/{conv_id}",
    status_code=status.HTTP_200_OK,
    response_model=InsightCardResponse,
    summary="Get a single conversation by ID",
)
async def get_single_conversation(conv_id: str):
    """Fetch a conversation by its UUID."""
    _validate_uuid(conv_id)
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conv_id} not found.",
        )
    return _conv_to_card(conv)


@router.put(
    "/{conv_id}",
    status_code=status.HTTP_200_OK,
    response_model=InsightCardResponse,
    summary="Update a conversation",
)
async def update_single_conversation(conv_id: str, body: ConversationUpdateBody):
    """Update transcript, summary, or flags on an existing conversation."""
    _validate_uuid(conv_id)

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update.",
        )

    conv = update_conversation(conv_id, updates)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conv_id} not found.",
        )
    return _conv_to_card(conv)


@router.delete(
    "/{conv_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a conversation",
)
async def delete_single_conversation(conv_id: str):
    """Delete a conversation by its UUID."""
    _validate_uuid(conv_id)
    deleted = delete_conversation(conv_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conv_id} not found.",
        )
    return {"deleted": True}
