import json
import os
import re
import logging
from pathlib import Path
from typing import Any, Dict
from dotenv import load_dotenv

# Load environment variables from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path, override=True)

logger = logging.getLogger(__name__)

def _get_runtime_api_key() -> str:
    """Load latest env values and return Gemini API key."""
    load_dotenv(env_path, override=True)
    return os.environ.get("GEMINI_API_KEY", "")

_SYSTEM_PROMPT = """\
You are a conversation analyst. Analyze the following meeting transcript and \
extracted entities, then return ONLY a single valid JSON object — no markdown, \
no explanation, no extra text. The JSON must have exactly these keys:

{
  "topic": "<main topic discussed>",
  "amount_discussed": "<brief quantifier, e.g. 'extensively', 'briefly'>",
  "decision": "<key decision made, or 'No decision reached'>",
  "sentiment": "<overall sentiment: positive | negative | neutral | mixed>",
  "next_action": "<concrete next step, or 'None identified'>",
  "confidence_score": <float 0.0-1.0 indicating your confidence>
}

Rules:
- Output ONLY the JSON object.
- Do NOT wrap it in ```json or any other formatting.
- Do NOT include any text before or after the JSON.
"""


def _build_user_prompt(transcript: str, entities: dict) -> str:
    """Build the user-facing prompt combining transcript and entities."""
    return (
        f"TRANSCRIPT:\n{transcript}\n\n"
        f"EXTRACTED ENTITIES:\n{json.dumps(entities, indent=2)}"
    )


def _extract_json(text: str) -> dict:
    """
    Robustly extract a JSON object from LLM output that may contain
    extra text, markdown fences, or other wrapping.
    """
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = cleaned.strip()

    # Attempt 1: direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt 2: find the first { ... } block using greedy match
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from model response: {text[:200]}")


def _generate_mock_response(transcript: str, entities: dict) -> Dict[str, Any]:
    """Return heuristic fallback when Gemini is unavailable."""
    logger.warning("Gemini unavailable, using heuristic fallback insights.")
    insight = _heuristic_insight(transcript, entities)
    insight["flagged_for_review"] = True
    insight["_mock"] = True
    insight["error"] = "Gemini unavailable; heuristic summary used"
    return insight


def _extract_amount_from_text(text: str) -> str:
    amount_pattern = re.compile(
        r"(\d+(?:[\.,]\d+)?)\s*(lakh|lakhs|crore|crores|thousand|k|m|million|billion|rupees?|rs\.?|inr)",
        re.IGNORECASE,
    )
    match = amount_pattern.search(text or "")
    if not match:
        # Support common Hindi numeric phrases.
        hindi_amount_pattern = re.compile(
            r"(\d+)\s*(लाख|हजार|करोड़|रुपये|रुपया)",
            re.IGNORECASE,
        )
        hindi_match = hindi_amount_pattern.search(text or "")
        if hindi_match:
            return f"{hindi_match.group(1)} {hindi_match.group(2)}".strip()
        return "unknown"
    return f"{match.group(1)} {match.group(2)}".strip()


def _heuristic_insight(transcript: str, entities: dict) -> Dict[str, Any]:
    transcript_lc = (transcript or "").lower()
    entities = entities or {}

    topics = entities.get("topics") or []
    instruments = entities.get("instruments") or []
    decisions = entities.get("decisions") or []
    amounts = entities.get("amounts") or []
    sentiment_values = entities.get("sentiment") or []

    topic = "unknown"
    if topics:
        topic = str(topics[0])
    elif instruments:
        topic = str(instruments[0])
    elif "loan" in transcript_lc:
        topic = "loan discussion"
    elif any(k in transcript_lc for k in ["लोन", "कर्ज", "ऋण"]):
        topic = "loan discussion"
    elif any(k in transcript_lc for k in ["sip", "invest", "investment", "mutual fund"]):
        topic = "investment planning"
    elif any(k in transcript_lc for k in ["निवेश", "म्यूचुअल फंड", "म्युचुअल फंड", "एसआईपी", "sip"]):
        topic = "investment planning"

    amount_discussed = "unknown"
    if amounts:
        amount_discussed = str(amounts[0])
    else:
        amount_discussed = _extract_amount_from_text(transcript)

    if amount_discussed == "unknown" and any(k in transcript_lc for k in ["लाख", "हजार", "करोड़", "रुपये", "रुपया", "rupees", "inr"]):
        amount_discussed = "mentioned"

    decision = "No decision reached"
    if decisions:
        decision = str(decisions[0])
    elif any(k in transcript_lc for k in ["need", "want", "chahiye", "apply", "lena"]):
        decision = "Intent expressed"
    elif any(k in transcript_lc for k in ["चाहिए", "लेना", "करना है", "सोच रहा", "सोच रही"]):
        decision = "Intent expressed"

    sentiment = "neutral"
    if sentiment_values:
        sentiment = str(sentiment_values[0]).lower()
    elif any(k in transcript_lc for k in ["great", "good", "happy", "excellent"]):
        sentiment = "positive"
    elif any(k in transcript_lc for k in ["bad", "worried", "problem", "stress"]):
        sentiment = "negative"

    next_action = "manual review required"
    if "loan" in topic or "loan" in transcript_lc:
        next_action = "Collect loan details and proceed with eligibility check"
    elif any(k in transcript_lc for k in ["लोन", "कर्ज", "ऋण", "ईएमआई", "emi"]):
        next_action = "Collect loan details and proceed with eligibility check"
    elif "investment" in topic:
        next_action = "Review risk profile and share suitable investment options"
    elif any(k in transcript_lc for k in ["निवेश", "म्यूचुअल", "एसआईपी", "sip"]):
        next_action = "Review risk profile and share suitable investment options"

    overall_confidence = float((entities.get("overall_confidence") or 0.0))
    if overall_confidence == 0.0:
        heuristic_points = 0.0
        if topic != "unknown":
            heuristic_points += 0.35
        if amount_discussed != "unknown":
            heuristic_points += 0.35
        if decision != "No decision reached":
            heuristic_points += 0.2
        if transcript.strip():
            heuristic_points += 0.1
        if any(k in transcript_lc for k in ["loan", "lakh", "rupees", "लोन", "लाख", "रुपये", "sip", "निवेश"]):
            heuristic_points += 0.15
        # Avoid zero-confidence outputs when we still have usable transcript text.
        if transcript.strip() and heuristic_points < 0.45:
            heuristic_points = 0.45
        overall_confidence = min(1.0, round(heuristic_points, 2))

    return {
        "topic": topic,
        "amount_discussed": amount_discussed,
        "decision": decision,
        "sentiment": sentiment,
        "next_action": next_action,
        "confidence_score": overall_confidence,
        "flagged_for_review": overall_confidence < 0.6,
    }


def _build_fallback(
    transcript: str,
    error: str | None = None,
    entities: dict | None = None,
) -> Dict[str, Any]:
    heuristic = _heuristic_insight(transcript, entities or {})
    return {
        "topic": heuristic["topic"],
        "amount_discussed": heuristic["amount_discussed"],
        "decision": heuristic["decision"],
        "sentiment": heuristic["sentiment"],
        "next_action": heuristic["next_action"],
        "confidence_score": heuristic["confidence_score"],
        "raw_transcript": transcript,
        "flagged_for_review": heuristic["flagged_for_review"],
        "error": error,
    }


class InsightGenerator:
    """
    Generates structured conversation insights using Google Gemini
    (gemini-1.5-flash). Falls back gracefully on API or parse failures,
    and supports a mock mode when no API key is present.
    """

    MODEL_NAME = "models/gemini-flash-latest"
    MAX_OUTPUT_TOKENS = 500

    def __init__(self):
        self._model = None
        self._mock_mode = True
        self._api_key = _get_runtime_api_key()

        if not self._api_key:
            logger.warning("GEMINI_API_KEY missing at InsightGenerator init; using mock mode.")
            return

        try:
            import google.generativeai as genai

            genai.configure(api_key=self._api_key)
            self._model = genai.GenerativeModel(
                model_name=self.MODEL_NAME,
                system_instruction=_SYSTEM_PROMPT,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=self.MAX_OUTPUT_TOKENS,
                    temperature=0.2,
                ),
            )
            self._mock_mode = False
        except Exception as exc:
            logger.exception("Failed to initialize Gemini model, using mock mode: %s", exc)
            self._model = None
            self._mock_mode = True

    def generate(self, transcript: str, entities: dict) -> Dict[str, Any]:
        """
        Analyze a transcript and its entities, returning structured insights.

        Returns a dict with keys:
            topic, amount_discussed, decision, sentiment,
            next_action, confidence_score

        On failure returns:
            { raw_transcript, flagged_for_review: True, error? }
        """
        # ── Mock mode ────────────────────────────────────────────
        if self._mock_mode:
            return _generate_mock_response(transcript, entities)

        # ── Real API call ────────────────────────────────────────
        user_prompt = _build_user_prompt(transcript, entities)

        try:
            response = self._model.generate_content(user_prompt)

            # Gemini may block content; check for a valid response
            if not response.parts:
                logger.error("Gemini returned an empty / blocked response.")
                return _build_fallback(
                    transcript,
                    "Empty or blocked response from Gemini",
                    entities,
                )

            raw_text = response.text

        except Exception as exc:
            logger.exception("Gemini API call failed.")
            return _build_fallback(transcript, f"API error: {exc}", entities)

        # ── Parse JSON from response ─────────────────────────────
        try:
            insight = _extract_json(raw_text)
        except ValueError as exc:
            logger.error("JSON extraction failed: %s", exc)
            return _build_fallback(transcript, str(exc), entities)

        # Validate expected keys are present
        required_keys = {
            "topic", "amount_discussed", "decision",
            "sentiment", "next_action", "confidence_score",
        }
        missing = required_keys - set(insight.keys())
        if missing:
            logger.warning("Insight missing keys %s — flagging for review.", missing)
            fallback = _build_fallback(transcript, None, entities)
            for key in required_keys:
                if key not in insight:
                    insight[key] = fallback[key]
            insight["flagged_for_review"] = True

        return insight
