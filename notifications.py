from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, Optional


@dataclass
class DeviceInfo:
    device_id: str
    push_token: str = ""
    platform: str = "unknown"


_DEVICES: Dict[str, DeviceInfo] = {}


def register_device(device_id: str, push_token: str = "", platform: str = "unknown") -> bool:
    _DEVICES[device_id] = DeviceInfo(device_id=device_id, push_token=push_token, platform=platform)
    return True


def get_device_info(device_id: str) -> Optional[dict]:
    device = _DEVICES.get(device_id)
    return asdict(device) if device else None


def get_notification_stats() -> dict:
    return {
        "total_devices": len(_DEVICES),
        "notifications_enabled": False,
    }