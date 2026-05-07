"""Make distill/ importable from tests without installing the package."""
from __future__ import annotations

import sys
from pathlib import Path

_DISTILL_ROOT = Path(__file__).resolve().parent.parent
if str(_DISTILL_ROOT) not in sys.path:
    sys.path.insert(0, str(_DISTILL_ROOT))
