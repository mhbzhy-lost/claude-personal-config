from __future__ import annotations

import re

from ulid import ULID

ULID_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")


def new_ulid() -> str:
    return str(ULID())


def is_ulid(value: str) -> bool:
    return bool(ULID_RE.match(value))
