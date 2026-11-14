"""Shared V3 display copy. The selected wording never grants access."""

import json
from pathlib import Path

_config = json.loads(
    (Path(__file__).resolve().parents[2] / "frontend/v3/member-copy.json").read_text(encoding="utf-8")
)
_copy_index = 1 if _config["mode"] == "free_registration" else 0


def member_copy(key: str) -> str:
    return _config["text"][key][_copy_index]


def apply_member_copy(text: str, key: str) -> str:
    return text.replace(_config["text"][key][0], member_copy(key))
