from __future__ import annotations

import os
import shutil
from pathlib import Path


def validate_audio(file_path: str, max_size_bytes: int):
    path = Path(file_path)
    if not path.exists():
        return False, "File not found"
    if path.stat().st_size <= 0:
        return False, "File is empty"
    if path.stat().st_size > max_size_bytes:
        return False, "File exceeds maximum allowed size"
    return True, "ok"


class AudioProcessor:
    @staticmethod
    def convert_to_target_format(input_path: str, chunk_id: str):
        source = Path(input_path)
        target = source.with_name(f"{source.stem}_{chunk_id}.wav")
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)
        return str(target), 0

    @staticmethod
    def cleanup_temp_file(file_path: str):
        try:
            os.remove(file_path)
        except OSError:
            pass