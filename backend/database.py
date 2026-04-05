from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4
import json


@dataclass
class Conversation:
    id: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    languages_detected: str = "unknown"
    raw_transcript: str = ""
    entities_json: str = "{}"
    summary_json: str = "{}"
    confidence_score: float = 0.0
    flagged_for_review: bool = False


_CONVERSATIONS: Dict[str, Conversation] = {}


def _serialise_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value)
    except TypeError:
        return json.dumps(str(value))


def save_conversation(
    *,
    languages_detected: Any,
    raw_transcript: Any,
    entities_json: Any,
    summary_json: Any,
    confidence_score: Any,
    flagged_for_review: Any,
) -> Conversation:
    conversation_id = str(uuid4())
    conversation = Conversation(
        id=conversation_id,
        languages_detected=str(languages_detected or "unknown"),
        raw_transcript=str(raw_transcript or ""),
        entities_json=_serialise_value(entities_json or {}),
        summary_json=_serialise_value(summary_json or {}),
        confidence_score=float(confidence_score or 0.0),
        flagged_for_review=bool(flagged_for_review),
    )
    _CONVERSATIONS[conversation_id] = conversation
    return conversation


def get_all_conversations() -> List[Conversation]:
    return sorted(_CONVERSATIONS.values(), key=lambda conv: conv.timestamp, reverse=True)


def get_conversation(conv_id: str) -> Optional[Conversation]:
    return _CONVERSATIONS.get(conv_id)


def update_conversation(conv_id: str, updates: Dict[str, Any]) -> Optional[Conversation]:
    conversation = _CONVERSATIONS.get(conv_id)
    if not conversation:
        return None

    if "raw_transcript" in updates:
        conversation.raw_transcript = str(updates["raw_transcript"] or "")
    if "summary_json" in updates:
        conversation.summary_json = _serialise_value(updates["summary_json"] or {})
    if "entities_json" in updates:
        conversation.entities_json = _serialise_value(updates["entities_json"] or {})
    if "languages_detected" in updates:
        conversation.languages_detected = str(updates["languages_detected"] or "unknown")
    if "confidence_score" in updates:
        conversation.confidence_score = float(updates["confidence_score"] or 0.0)
    if "flagged_for_review" in updates:
        conversation.flagged_for_review = bool(updates["flagged_for_review"])

    return conversation


def delete_conversation(conv_id: str) -> bool:
    return _CONVERSATIONS.pop(conv_id, None) is not None