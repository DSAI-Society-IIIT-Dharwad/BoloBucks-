from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field


class InsightCardResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    timestamp: Optional[str] = None
    languages_detected: Any = None
    raw_transcript: str = ""
    entities: Dict[str, Any] = Field(default_factory=dict)
    summary: Dict[str, Any] = Field(default_factory=dict)
    confidence_score: float = 0.0
    flagged_for_review: bool = False


class ConversationUpdateBody(BaseModel):
    model_config = ConfigDict(extra="allow")

    raw_transcript: Optional[str] = None
    summary_json: Optional[Dict[str, Any]] = None
    entities_json: Optional[Dict[str, Any]] = None
    structured_summary: Optional[Dict[str, Any]] = None
    financial_entities: Optional[Dict[str, Any]] = None
    languages_detected: Optional[Any] = None
    confidence_score: Optional[float] = None
    flagged_for_review: Optional[bool] = None


class MobileUploadResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    success: bool = True
    conversation_id: str = ""
    message: str = ""
    data: Optional[InsightCardResponse] = None