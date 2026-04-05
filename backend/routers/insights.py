"""
Insights Router
===============
Endpoints for retrieving financial insights from conversations.
"""

import logging
import json
from typing import List

from fastapi import APIRouter, HTTPException, status
from backend.database import get_all_conversations
from backend.insight_postprocess import normalize_card_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/insights", tags=["insights"])


def _parse_insight(conv):
    """Extract and parse insight from a conversation object."""
    summary = {}
    
    # Parse summary JSON if available
    if conv.summary_json:
        try:
            summary = json.loads(conv.summary_json)
        except (json.JSONDecodeError, TypeError):
            summary = {}

    entities = {}
    if conv.entities_json:
        try:
            entities = json.loads(conv.entities_json)
        except (json.JSONDecodeError, TypeError):
            entities = {}

    normalized = normalize_card_payload(
        raw_transcript=conv.raw_transcript,
        entities=entities,
        summary=summary,
        confidence_score=conv.confidence_score,
        flagged_for_review=conv.flagged_for_review,
    )

    safe_summary = normalized["summary"]

    insight = {
        "id": conv.id,
        "timestamp": conv.timestamp.isoformat() if conv.timestamp else None,
        "languages_detected": conv.languages_detected,
        "raw_transcript": normalized["raw_transcript"],
        "topic": safe_summary.get("topic", "unknown"),
        "amount_discussed": safe_summary.get("amount_discussed", "unknown"),
        "decision": safe_summary.get("decision", "unknown"),
        "sentiment": safe_summary.get("sentiment", "neutral"),
        "next_action": safe_summary.get("next_action", "unknown"),
        "confidence_score": normalized["confidence_score"],
        "flagged_for_review": normalized["flagged_for_review"],
    }
    
    return insight


@router.get(
    "/",
    status_code=status.HTTP_200_OK,
    summary="Get all financial insights from conversations"
)
async def get_insights():
    """
    Return all conversations with their extracted insights.
    Each insight includes:
    - Topic discussed
    - Amount discussed
    - Key decision
    - Sentiment
    - Next action
    - Confidence score
    """
    try:
        conversations = get_all_conversations()
        insights = [_parse_insight(c) for c in conversations]
        
        return {
            "total_insights": len(insights),
            "insights": insights
        }
    except Exception as e:
        logger.error(f"Error retrieving insights: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve insights"
        )


@router.get(
    "/{conversation_id}",
    status_code=status.HTTP_200_OK,
    summary="Get insight for a specific conversation"
)
async def get_insight_by_conversation(conversation_id: str):
    """
    Retrieve the financial insight for a specific conversation by its ID.
    """
    from backend.database import get_conversation
    
    try:
        conv = get_conversation(conversation_id)
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Conversation {conversation_id} not found"
            )
        
        insight = _parse_insight(conv)
        return {"insight": insight}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving insight: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve insight"
        )
