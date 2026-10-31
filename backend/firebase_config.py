"""
ChauleNotes - Firebase configuration (Firestore + Auth).

WHY THIS FILE EXISTS (Beginner note)
------------------------------------
React is public: every visitor can read the JavaScript bundle. Therefore React
must NEVER hold a Firebase service-account key. The Python backend keeps that
secret and is the only part of ChauleNotes allowed to talk to Firestore.

The browser -> Python -> Firebase flow makes Python the "middleman" (security
guard):
  1. React sends a Firebase Auth ID token to FastAPI.
  2. FastAPI verifies the token and checks the user's `role` in Firestore.
  3. FastAPI reads/writes Firestore with the Admin SDK.

Firestore is schemaless, so the "schema" below is documented in code instead of
SQL. Each collection is created automatically the first time a document is
written. `ensure_schema()` writes a small `_meta/schema` document so a brand-new
Firebase project still shows the intended structure.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import firebase_admin
from firebase_admin import auth, credentials, firestore

# Load backend/.env in every entry point (main.py, set_admin.py, tests) so the
# helper scripts behave exactly like the API.
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:  # python-dotenv is optional at runtime
    pass

logger = logging.getLogger("chaulenotes.firebase")

# ---------------------------------------------------------------------------
# Firestore collection names (use these constants everywhere in main.py)
# ---------------------------------------------------------------------------
COLLECTIONS = {
    "profiles": "profiles",
    "workspaces": "workspaces",
    "pages": "pages",
    "tasks": "tasks",
    "attachments": "attachments",
    "attachment_folders": "attachment_folders",
    "admin_logs": "admin_logs",
}

# Human-readable field map. This replaces database/schema.sql from the Supabase
# version. It is documentation only - Firestore does not require a migration.
COLLECTION_SCHEMA: Dict[str, Dict[str, str]] = {
    "profiles": {
        "id": "Firebase Auth UID (document id)",
        "username": "Display name",
        "email": "Login email (passwords live only inside Firebase Auth)",
        "role": "'user' or 'admin' (checked by Python on every request)",
        "avatar_url": "Optional profile image URL",
        "theme_preference": "'light' | 'dark' | 'system'",
        "workspace_id": "Default personal workspace id",
        "created_at": "ISO-8601 string",
        "updated_at": "ISO-8601 string",
    },
    "workspaces": {
        "name": "Workspace name (default: Personal)",
        "owner_id": "profiles document id",
        "created_at": "ISO-8601 string",
    },
    "pages": {
        "title": "Note title",
        "content": "Tiptap JSON document",
        "parent_id": "Parent page id for folders (optional)",
        "workspace_id": "Workspaces document id (optional)",
        "owner_id": "profiles document id",
        "is_favorite": "boolean",
        "is_archived": "boolean",
        "is_trashed": "boolean (soft delete)",
        "icon": "Optional emoji/icon",
        "cover_image": "Optional image URL",
        "tags": "list of strings",
        "created_at": "ISO-8601 string",
        "updated_at": "ISO-8601 string",
        "updated_by": "profiles document id of the last editor",
    },
    "tasks": {
        "content": "Task text",
        "owner_id": "profiles document id",
        "page_id": "Optional related page id",
        "is_completed": "boolean",
        "priority": "'low' | 'medium' | 'high'",
        "due_date": "ISO-8601 string or null",
        "created_at": "ISO-8601 string",
        "updated_at": "ISO-8601 string",
    },
    "attachments": {
        "page_id": "Related page id",
        "owner_id": "profiles document id",
        "bucket_path": "Private Supabase Storage object key",
        "file_type": "MIME type",
        "size": "Bytes",
        "created_at": "ISO-8601 string",
    },
    "attachment_folders": {
        "owner_id": "profiles document id",
        "name": "Folder display name",
        "parent_id": "Optional parent folder document id",
        "created_at": "ISO-8601 string",
        "updated_at": "ISO-8601 string",
    },
    "admin_logs": {
        "admin_id": "profiles document id of the admin",
        "action": "e.g. role.updated, note.updated",
        "target_id": "Affected user or note id",
        "details": "Free-form metadata",
        "created_at": "ISO-8601 string",
    },
}


def _app_is_initialized() -> bool:
    """Return True when firebase_admin has already been initialised."""
    try:
        firebase_admin.get_app()
        return True
    except ValueError:
        return False


def _resolve_credentials_path(path: Optional[str]) -> Optional[str]:
    """
    Make relative credential paths work from any working directory.

    `FIREBASE_CREDENTIALS_PATH=./serviceAccountKey.json` should still be found
    when uvicorn is launched from the repository root instead of backend/.
    """
    if not path:
        return path

    expanded = os.path.expanduser(path)
    if os.path.isabs(expanded) or os.path.exists(expanded):
        return expanded

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.join(backend_dir, expanded)
    return candidate if os.path.exists(candidate) else expanded


def initialize_firebase() -> None:
    """
    Start the Firebase Admin SDK.

    Credential priority:
      1. FIREBASE_SERVICE_ACCOUNT_JSON - full JSON in one env var (good for Render).
      2. FIREBASE_CREDENTIALS_PATH     - path to serviceAccountKey.json (local dev).
      3. GOOGLE_APPLICATION_CREDENTIALS - standard Google Cloud variable.
      4. Application Default Credentials (good on Google Cloud / Cloud Run).
    """
    if _app_is_initialized():
        return

    project_id = os.getenv("FIREBASE_PROJECT_ID")
    emulator_host = os.getenv("FIRESTORE_EMULATOR_HOST")
    credentials_path = _resolve_credentials_path(
        os.getenv("FIREBASE_CREDENTIALS_PATH")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    )
    # Make the standard local filename work without requiring an extra env var.
    # The project .gitignore excludes this private key from version control.
    if not credentials_path:
        default_key = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "serviceAccountKey.json"
        )
        if os.path.isfile(default_key):
            credentials_path = default_key
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

    try:
        if emulator_host:
            # Local emulator: no real service-account file is needed.
            firebase_admin.initialize_app(
                options={"projectId": project_id or "demo-chaulenotes"}
            )
            logger.info("Firebase initialised against the local emulator.")
            return

        if service_account_json:
            cred = credentials.Certificate(json.loads(service_account_json))
        elif credentials_path and os.path.exists(credentials_path):
            cred = credentials.Certificate(credentials_path)
        else:
            # On Cloud Run / App Engine / GKE this picks up the attached service account.
            cred = credentials.ApplicationDefault()

        options = {"projectId": project_id} if project_id else None
        firebase_admin.initialize_app(cred, options)
        logger.info("Firebase Admin SDK initialised successfully.")
    except Exception as exc:  # noqa: BLE001 - surfaced with a friendly message
        raise RuntimeError(
            "Firebase could not start. Add backend/serviceAccountKey.json and set "
            "FIREBASE_CREDENTIALS_PATH in backend/.env, or set "
            "FIREBASE_SERVICE_ACCOUNT_JSON. See README section 'Manual Configuration'."
        ) from exc


def get_db():
    """Return the Firestore client, initialising Firebase if needed."""
    if not _app_is_initialized():
        initialize_firebase()
    return firestore.client()


def get_auth():
    """Return the firebase_admin.auth module."""
    if not _app_is_initialized():
        initialize_firebase()
    return auth


def ensure_schema(db=None) -> Dict[str, Any]:
    """
    Write a tiny `_meta/schema` document.

    Firestore creates collections on first write, so this is not a migration.
    It simply documents the expected collections and makes the Firebase Console
    show something useful on a fresh project.
    """
    db = db or get_db()
    payload = {
        "app": "ChauleNotes",
        "tagline": "Every thought has a place.",
        "version": 1,
        "collections": list(COLLECTIONS.values()),
        "schema": COLLECTION_SCHEMA,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db.collection("_meta").document("schema").set(payload, merge=True)
    return payload


def get_project_id() -> Optional[str]:
    """Best-effort Firebase project id for diagnostics and the admin dashboard."""
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    if project_id:
        return project_id
    try:
        app = firebase_admin.get_app()
        return app.project_id
    except Exception:  # noqa: BLE001
        return None


