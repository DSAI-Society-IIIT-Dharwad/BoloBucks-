from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_ASR_ENGINE = None


class _FallbackASREngine:
    def transcribe(self, chunk):
        return {
            "chunk_id": chunk.get("chunk_id", "unknown"),
            "transcript": "",
            "language": "unknown",
            "confidence": 0.0,
            "model_used": "fallback",
            "is_code_mixed": False,
        }


def get_asr_engine():
    global _ASR_ENGINE
    if _ASR_ENGINE is not None:
        return _ASR_ENGINE

    try:
        from audio.asr_engine import ASREngine

        _ASR_ENGINE = ASREngine()
    except Exception as exc:
        logger.warning("Falling back to stub ASR engine: %s", exc)
        _ASR_ENGINE = _FallbackASREngine()

    return _ASR_ENGINE