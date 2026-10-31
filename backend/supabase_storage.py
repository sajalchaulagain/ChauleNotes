"""Optional, server-only Supabase Storage adapter for ChauleNotes files."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, Optional


class StorageNotConfiguredError(RuntimeError):
    """Raised when an attachment operation is attempted without credentials."""


def storage_status() -> Dict[str, Any]:
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "").strip() or "chaule-notes-files"
    ready = bool(
        os.getenv("SUPABASE_URL", "").strip()
        and (os.getenv("SUPABASE_SECRET_KEY", "").strip() or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
        and bucket
    )
    try:
        max_file_size_mb = max(1, int(os.getenv("MAX_ATTACHMENT_MB", "20")))
    except ValueError:
        max_file_size_mb = 20
    return {
        "configured": ready,
        "provider": "supabase-storage",
        "bucket": bucket,
        "max_file_size_mb": max_file_size_mb,
        "message": "Supabase file storage is ready." if ready else "File attachments are disabled. Configure SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env.",
    }


def is_storage_configured() -> bool:
    return bool(storage_status()["configured"])


@lru_cache(maxsize=1)
def get_storage_bucket():
    """Create a private-bucket client only when an authenticated file action needs it."""
    url = os.getenv("SUPABASE_URL", "").strip()
    # Prefer the current backend-only Supabase secret key; accept the legacy
    # service-role name during migration so existing local environments continue.
    key = (os.getenv("SUPABASE_SECRET_KEY", "").strip() or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "").strip() or "chaule-notes-files"
    if not (url and key and bucket):
        raise StorageNotConfiguredError(storage_status()["message"])

    # Import lazily: the app and non-file features remain available without this SDK/config.
    from supabase import create_client

    return create_client(url, key).storage.from_(bucket)


def signed_download_url(path: str, *, download: bool = False) -> Optional[str]:
    response = get_storage_bucket().create_signed_url(
        path, 600, {"download": download}
    )
    if isinstance(response, dict):
        return response.get("signedURL") or response.get("signedUrl")
    return getattr(response, "signed_url", None) or getattr(response, "signedURL", None)
