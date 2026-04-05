from __future__ import annotations

from pathlib import Path

ALLOWED_AUDIO_FORMATS = [".wav", ".mp3", ".m4a", ".ogg", ".aac", ".flac", ".webm"]
ALLOWED_PLATFORMS = ["ios", "android", "web"]
ENABLE_PUSH_NOTIFICATIONS = False
TARGET_SAMPLE_RATE = 16000
MAX_AUDIO_SIZE_MB = 25


def is_audio_format_allowed(filename: str) -> bool:
    suffix = Path(filename or "").suffix.lower()
    return suffix in ALLOWED_AUDIO_FORMATS


def get_max_audio_size_bytes() -> int:
    return MAX_AUDIO_SIZE_MB * 1024 * 1024