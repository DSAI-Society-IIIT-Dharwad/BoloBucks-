"""End-to-end smoke test for the Armour.AI app.

This script checks:
- Backend health
- /v1/conversations/process upload path
- /mobile/v1/conversations/upload path
- Conversation list retrieval
- Single conversation retrieval
- Mobile health endpoint

Usage:
    python scripts/smoke_test_app.py --base-url http://127.0.0.1:8000
    python scripts/smoke_test_app.py --base-url http://127.0.0.1:8000 --audio-file path\\to\\sample.wav

If no audio file is provided, the script generates a short WAV tone in a temporary file.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

import requests


@dataclass
class TestResult:
    name: str
    ok: bool
    details: str = ""


def make_test_tone(path: Path, duration_seconds: float = 1.0, frequency_hz: float = 440.0) -> None:
    sample_rate = 16000
    amplitude = 12000
    total_frames = int(sample_rate * duration_seconds)

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        frames = bytearray()
        for frame_index in range(total_frames):
            sample = int(amplitude * math.sin(2 * math.pi * frequency_hz * frame_index / sample_rate))
            frames.extend(int(sample).to_bytes(2, byteorder="little", signed=True))
        wav_file.writeframes(bytes(frames))


def print_result(result: TestResult) -> None:
    status = "PASS" if result.ok else "FAIL"
    print(f"[{status}] {result.name}")
    if result.details:
        print(result.details)


def pretty_json(payload: Any) -> str:
    try:
        return json.dumps(payload, indent=2, ensure_ascii=False)
    except Exception:
        return str(payload)


class SmokeTester:
    def __init__(self, base_url: str, audio_path: Optional[Path] = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.audio_path = audio_path
        self.temp_audio_path: Optional[Path] = None
        self.results: list[TestResult] = []

    def _request_json(self, method: str, url: str, **kwargs: Any) -> Dict[str, Any]:
        response = requests.request(method, url, timeout=60, **kwargs)
        response.raise_for_status()
        return response.json()

    def _ensure_audio(self) -> Path:
        if self.audio_path and self.audio_path.exists():
            return self.audio_path

        temp_dir = Path(tempfile.gettempdir())
        self.temp_audio_path = temp_dir / f"armour_ai_test_{uuid4().hex}.wav"
        make_test_tone(self.temp_audio_path)
        return self.temp_audio_path

    def run(self) -> int:
        try:
            self.check_backend_health()
            self.check_mobile_health()
            self.test_process_endpoint()
            self.test_mobile_upload_endpoint()
            self.test_conversation_listing()
            self.test_single_conversation_lookup()
        finally:
            if self.temp_audio_path and self.temp_audio_path.exists():
                try:
                    self.temp_audio_path.unlink()
                except OSError:
                    pass

        print("\nSummary:")
        for item in self.results:
            print_result(item)

        failed = [item for item in self.results if not item.ok]
        return 1 if failed else 0

    def check_backend_health(self) -> None:
        try:
            payload = self._request_json("GET", f"{self.base_url}/health")
            self.results.append(
                TestResult(
                    name="Backend health",
                    ok=payload.get("status") == "ok",
                    details=pretty_json(payload),
                )
            )
        except Exception as exc:
            self.results.append(TestResult(name="Backend health", ok=False, details=str(exc)))

    def check_mobile_health(self) -> None:
        try:
            payload = self._request_json("GET", f"{self.base_url}/mobile/v1/health")
            status = payload.get("status")
            self.results.append(
                TestResult(
                    name="Mobile health",
                    ok=status in {"healthy", "degraded"},
                    details=pretty_json(payload),
                )
            )
        except Exception as exc:
            self.results.append(TestResult(name="Mobile health", ok=False, details=str(exc)))

    def test_process_endpoint(self) -> None:
        audio_file = self._ensure_audio()
        try:
            with audio_file.open("rb") as handle:
                files = {"file": (audio_file.name, handle, "audio/wav")}
                payload = self._request_json(
                    "POST",
                    f"{self.base_url}/v1/conversations/process",
                    files=files,
                )

            ok = bool(payload.get("id")) and isinstance(payload.get("summary"), dict)
            self.results.append(
                TestResult(
                    name="Process audio endpoint",
                    ok=ok,
                    details=pretty_json(payload),
                )
            )
        except Exception as exc:
            self.results.append(TestResult(name="Process audio endpoint", ok=False, details=str(exc)))

    def test_mobile_upload_endpoint(self) -> None:
        audio_file = self._ensure_audio()
        device_id = f"smoke-{uuid4().hex[:8]}"
        recorded_at = "2026-04-05T00:00:00Z"

        try:
            with audio_file.open("rb") as handle:
                files = {"file": (audio_file.name, handle, "audio/wav")}
                data = {"device_id": device_id, "recorded_at": recorded_at}
                payload = self._request_json(
                    "POST",
                    f"{self.base_url}/mobile/v1/conversations/upload",
                    files=files,
                    data=data,
                )

            ok = payload.get("success") is True and bool(payload.get("conversation_id"))
            self.results.append(
                TestResult(
                    name="Mobile upload endpoint",
                    ok=ok,
                    details=pretty_json(payload),
                )
            )
        except Exception as exc:
            self.results.append(TestResult(name="Mobile upload endpoint", ok=False, details=str(exc)))

    def test_conversation_listing(self) -> None:
        try:
            payload = self._request_json("GET", f"{self.base_url}/v1/conversations")
            ok = isinstance(payload, list)
            self.results.append(
                TestResult(
                    name="Conversation list endpoint",
                    ok=ok,
                    details=pretty_json(payload[:2] if isinstance(payload, list) else payload),
                )
            )
        except Exception as exc:
            self.results.append(TestResult(name="Conversation list endpoint", ok=False, details=str(exc)))

    def test_single_conversation_lookup(self) -> None:
        try:
            listing = self._request_json("GET", f"{self.base_url}/v1/conversations")
            if not isinstance(listing, list) or not listing:
                self.results.append(
                    TestResult(
                        name="Single conversation lookup",
                        ok=False,
                        details="No conversations available to look up.",
                    )
                )
                return

            conversation_id = listing[0].get("id")
            if not conversation_id:
                self.results.append(
                    TestResult(
                        name="Single conversation lookup",
                        ok=False,
                        details="Latest conversation does not have an id.",
                    )
                )
                return

            payload = self._request_json("GET", f"{self.base_url}/v1/conversations/{conversation_id}")
            ok = payload.get("id") == conversation_id
            self.results.append(
                TestResult(
                    name="Single conversation lookup",
                    ok=ok,
                    details=pretty_json(payload),
                )
            )
        except Exception as exc:
            self.results.append(TestResult(name="Single conversation lookup", ok=False, details=str(exc)))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke test the Armour.AI app")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("ARMOUR_API_BASE_URL", "http://127.0.0.1:8000"),
        help="Backend base URL (default: http://127.0.0.1:8000)",
    )
    parser.add_argument(
        "--audio-file",
        default=None,
        help="Optional audio file path to upload. If omitted, a temporary WAV tone is generated.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audio_path = Path(args.audio_file).expanduser().resolve() if args.audio_file else None
    tester = SmokeTester(args.base_url, audio_path=audio_path)
    return tester.run()


if __name__ == "__main__":
    raise SystemExit(main())
