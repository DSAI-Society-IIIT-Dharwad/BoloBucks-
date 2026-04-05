"""
Pipeline Orchestrator
=====================
Three-stage pipeline: ASR → NLP → Insight Generation.

Currently uses mock implementations for ASR and NLP stages.
Replace the ASREngine / NLPProcessor classes with real implementations
when ready — the PipelineOrchestrator interface stays the same.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict
from dotenv import load_dotenv

# Load environment variables early from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path, override=True)

from backend.insight_generator import InsightGenerator
from backend.model_registry import get_asr_engine
from nlp.pipeline import run_nlp_pipeline

# ─── Logging ──────────────────────────────────────────────────────────────────
# Dedicated file handler so pipeline errors are always persisted.
logger = logging.getLogger("pipeline")
logger.setLevel(logging.DEBUG)

_file_handler = logging.FileHandler("pipeline_errors.log", encoding="utf-8")
_file_handler.setLevel(logging.ERROR)
_file_handler.setFormatter(
    logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
)
logger.addHandler(_file_handler)

# Also log to console at INFO for convenience during development.
_console_handler = logging.StreamHandler()
_console_handler.setLevel(logging.INFO)
_console_handler.setFormatter(
    logging.Formatter("%(asctime)s | %(name)s | %(levelname)s | %(message)s")
)
logger.addHandler(_console_handler)

# Import real ASR and NER engines (HF_TOKEN from .env will be used automatically)
try:
    from audio.asr_engine import ASREngine as RealASREngine
    from nlp.ner import FinancialNER
    logger.info("Real ASR and NER engines imported successfully")
except ImportError as e:
    logger.error(f"Failed to import real ASR/NER: {e}")
    RealASREngine = None
    FinancialNER = None


# ─── InsightCard helper ───────────────────────────────────────────────────────

def _empty_card(
    *,
    transcript: str = "",
    entities: dict | None = None,
    error: str = "",
    flagged: bool = True,
) -> Dict[str, Any]:
    """
    Return a fully-populated InsightCard structure.
    Every caller is guaranteed the same shape — no KeyError surprises downstream.
    """
    return {
        "topic": "unknown",
        "amount_discussed": "unknown",
        "decision": "unknown",
        "sentiment": "neutral",
        "next_action": "manual review required",
        "confidence_score": 0.0,
        "confidence_explanation": "",
        "raw_transcript": transcript,
        "language_detected": "unknown",
        "entities": entities or {},
        "flagged_for_review": flagged,
        "error": error,
    }


def _build_confidence_explanation(transcript: str, entities: dict, insight_card: dict) -> str:
    confidence_score = float(insight_card.get("confidence_score", 0.0) or 0.0)
    topic = str(insight_card.get("topic", "unknown") or "unknown")

    entity_conf = entities.get("confidence_scores", {}) if isinstance(entities, dict) else {}
    strongest_signals = []

    for key in ("instruments", "amounts", "decisions", "persons"):
        value = float(entity_conf.get(key, 0.0) or 0.0)
        if value > 0:
            strongest_signals.append(f"{key}={value:.2f}")

    if confidence_score >= 0.8:
        level = "high"
    elif confidence_score >= 0.6:
        level = "moderate"
    else:
        level = "low"

    if strongest_signals:
        signals_text = ", ".join(strongest_signals[:3])
    else:
        signals_text = "no strong entity matches"

    transcript_length = len((transcript or "").split())
    length_text = "longer transcript" if transcript_length >= 25 else "shorter transcript"

    return (
        f"{level.capitalize()} confidence because the topic appears to be '{topic}', "
        f"supported by {signals_text} and a {length_text}."
    )


# ─── Orchestrator ─────────────────────────────────────────────────────────────

class PipelineOrchestrator:
    """
    End-to-end pipeline that chains ASR → NLP → InsightGenerator.

    Guarantees:
        • Never raises exceptions.
        • Always returns a full InsightCard dict (6 insight fields + flags).
        • Sets flagged_for_review=True whenever any stage fails.
        • Logs every error to pipeline_errors.log.
    """

    def __init__(self, insight_generator: InsightGenerator | None = None):
        """Initialize orchestrator with singleton ASR and NLP components."""
        # ASR engine is managed globally by get_asr_engine() singleton
        # NLP pipeline is managed globally by run_nlp_pipeline()
        self.asr = get_asr_engine()
        self.insight = insight_generator or InsightGenerator()

    # ── public API ────────────────────────────────────────────────

    def process(self, audio_chunk: dict) -> Dict[str, Any]:
        """
        Run the full pipeline on a single audio chunk.

        Returns an InsightCard dict — always complete, never raises.
        """

        # ── Stage 1: ASR ─────────────────────────────────────────
        try:
            asr_result = self.asr.transcribe(audio_chunk)
            transcript = asr_result.get("transcript", "")
            language_detected = asr_result.get("language", "unknown")
            if not transcript:
                raise ValueError("ASR returned an empty transcript")
        except Exception as exc:
            logger.error("ASR stage failed: %s", exc, exc_info=True)
            return _empty_card(
                transcript="",
                error=f"ASR failure: {exc}",
                flagged=True,
            )

        # ── Stage 2: NLP ─────────────────────────────────────────
        try:
            nlp_input = {
                "chunk_id": audio_chunk.get("chunk_id", ""),
                "raw_text": transcript,
                "language_detected": language_detected,
            }
            nlp_result = run_nlp_pipeline(nlp_input)
            if nlp_result is None:
                nlp_result = {}

            entities = {
                "instruments": nlp_result.get("instruments", []),
                "amounts": nlp_result.get("amounts", []),
                "durations": nlp_result.get("durations", []),
                "decisions": nlp_result.get("decisions", []),
                "persons": nlp_result.get("persons", []),
                "organizations": nlp_result.get("organizations", []),
                "monetary": nlp_result.get("monetary", []),
                "topics": nlp_result.get("topics", []),
                "confidence_scores": nlp_result.get("confidence_scores", {}),
                "overall_confidence": nlp_result.get("overall_confidence", 0.0),
            }
        except Exception as exc:
            logger.error("NLP stage failed: %s", exc, exc_info=True)
            return _empty_card(
                transcript=transcript,
                error=f"NLP failure: {exc}",
                flagged=True,
            )

        # ── Stage 3: Insight Generation ──────────────────────────
        try:
            insight_card = self.insight.generate(transcript, entities)
        except Exception as exc:
            logger.error("Insight stage failed: %s", exc, exc_info=True)
            return _empty_card(
                transcript=transcript,
                entities=entities,
                error=f"Insight failure: {exc}",
                flagged=True,
            )

        # ── Normalise the card so the shape is always consistent ─
        card = _empty_card(
            transcript=transcript,
            entities=entities,
            flagged=insight_card.get("flagged_for_review", False),
        )
        # Set the language that was detected by ASR
        card["language_detected"] = language_detected
        # Overlay real insight values onto the template
        for key in ("topic", "amount_discussed", "decision",
                     "sentiment", "next_action", "confidence_score"):
            if key in insight_card:
                card[key] = insight_card[key]

        card["confidence_explanation"] = _build_confidence_explanation(transcript, entities, insight_card)

        # Preserve any extra keys the generator added (e.g. _mock, error)
        for key, value in insight_card.items():
            if key not in card:
                card[key] = value

        return card
