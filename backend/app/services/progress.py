"""
Simple in-memory progress tracking for long-running operations.
"""

from datetime import datetime
from typing import Optional
import threading

# Thread-safe progress store
_progress_lock = threading.Lock()
_progress_store: dict[str, dict] = {}


def set_progress(
    session_id: int,
    step: str,
    current: int,
    total: int,
    message: str = "",
    sub_step: str = ""
):
    """Update progress for a session."""
    key = f"session_{session_id}"
    with _progress_lock:
        _progress_store[key] = {
            "session_id": session_id,
            "step": step,
            "current": current,
            "total": total,
            "message": message,
            "sub_step": sub_step,
            "percent": round((current / total * 100) if total > 0 else 0, 1),
            "updated_at": datetime.utcnow().isoformat(),
        }


def get_progress(session_id: int) -> Optional[dict]:
    """Get current progress for a session."""
    key = f"session_{session_id}"
    with _progress_lock:
        return _progress_store.get(key)


def clear_progress(session_id: int):
    """Clear progress for a session (when done)."""
    key = f"session_{session_id}"
    with _progress_lock:
        if key in _progress_store:
            del _progress_store[key]


def is_processing(session_id: int) -> bool:
    """Check if session is currently being processed."""
    key = f"session_{session_id}"
    with _progress_lock:
        return key in _progress_store

