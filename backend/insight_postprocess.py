"""
Post-processing helpers for conversation insight responses.

Normalizes transcript text and repairs stale/mock summaries using
heuristic fallback logic when needed.
"""

from __future__ import annotations

import re
from typing import Any, Dict

from backend.insight_generator import _heuristic_insight


_PLACEHOLDER_PATTERNS = [
    "mock",
    "api key not configured",
    "gemini_api_key",
    "no decision",
]


def _normalize_transcript_text(value: Any) -> str:
    text = str(value or "")
    # Keep paragraph breaks while collapsing noisy spacing.
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[\t\f\v]+", " ", text)
    text = re.sub(r"[ ]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _is_placeholder_summary(summary: Dict[str, Any] | None) -> bool:
    if not summary:
        return True

    joined = " ".join(
        str(summary.get(k, ""))
        for k in ("topic", "amount_discussed", "decision", "sentiment", "next_action")
    ).lower()

    if not joined.strip():
        return True

    return any(pattern in joined for pattern in _PLACEHOLDER_PATTERNS)


def normalize_card_payload(
    *,
    raw_transcript: Any,
    entities: Dict[str, Any] | None,
    summary: Dict[str, Any] | None,
    confidence_score: Any,
    flagged_for_review: Any,
) -> Dict[str, Any]:
    """
    Normalize and heal card payload fields before returning to clients.

    - Cleans transcript text formatting.
    - Replaces stale/mock summaries with heuristic summaries.
    - Recomputes confidence when persisted value is missing or <= 0.
    """
    transcript = _normalize_transcript_text(raw_transcript)
    safe_entities = entities if isinstance(entities, dict) else {}
    safe_summary = summary if isinstance(summary, dict) else {}

    try:
        safe_confidence = float(confidence_score)
    except (TypeError, ValueError):
        safe_confidence = 0.0

    should_rebuild_summary = _is_placeholder_summary(safe_summary)
    should_rebuild_confidence = safe_confidence <= 0.0

    if should_rebuild_summary or should_rebuild_confidence:
        heuristic = _heuristic_insight(transcript, safe_entities)

        if should_rebuild_summary:
            safe_summary = {
                "topic": heuristic["topic"],
                "amount_discussed": heuristic["amount_discussed"],
                "decision": heuristic["decision"],
                "sentiment": heuristic["sentiment"],
                "next_action": heuristic["next_action"],
            }

        if should_rebuild_confidence:
            safe_confidence = float(heuristic["confidence_score"])

    return {
        "raw_transcript": transcript,
        "entities": safe_entities,
        "summary": safe_summary,
        "confidence_score": safe_confidence,
        "flagged_for_review": bool(flagged_for_review),
    }
