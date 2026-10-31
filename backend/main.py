"""
ChauleNotes API - FastAPI + Firebase (Firestore + Auth)
Founder: Sajal Chaulagain (Mr. Chaule)
Tagline: Every thought has a place.

BEGINNER NOTE - WHY PYTHON SITS IN THE MIDDLE
---------------------------------------------
React (the frontend) is public code. If we let React talk straight to Firebase,
every visitor could inspect the browser and try to read/write data directly.
Python is the "middleman" / security guard:

React  --(Firebase ID token)-->  FastAPI  --(Admin SDK)-->  Firebase Firestore

Python:
  1. Verifies the Firebase ID token on every request.
  2. Loads `role` from the Firestore `profiles` collection.
  3. Enforces owner/admin rules (the replacement for Supabase RLS).
  4. Keeps the Firebase service-account key out of the browser.

Firebase still stores the data and manages email/password accounts. Python never
stores passwords: Firebase Auth hashes them for us.

Run locally:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
Interactive docs: http://localhost:8000/docs
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import firestore
from pydantic import BaseModel, Field

try:
    from .firebase_config import (
        COLLECTIONS,
        get_auth,
        get_db,
        get_project_id,
    )
    from .supabase_storage import (
        StorageNotConfiguredError, get_storage_bucket,
        is_storage_configured, signed_download_url, storage_status,
    )
except ImportError:  # Allows: cd backend && uvicorn main:app --reload
    from firebase_config import (  # type: ignore
        COLLECTIONS,
        get_auth,
        get_db,
        get_project_id,
    )
    from supabase_storage import (  # type: ignore
        StorageNotConfiguredError, get_storage_bucket,
        is_storage_configured, signed_download_url, storage_status,
    )

# Load backend/.env when running locally. In production use real env variables.
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("chaulenotes.api")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("ADMIN_EMAILS", "").split(",")
    if email.strip()
}
_configured_cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:5174"
    ).split(",")
    if origin.strip()
]
# Vite may print localhost or its 127.0.0.1 address depending on launch flags.
# Treat those equivalent local origins the same for the standard dev ports.
CORS_ORIGINS = list(_configured_cors_origins)
for origin in _configured_cors_origins:
    if origin in {"http://localhost:5173", "http://localhost:5174"}:
        alias = origin.replace("localhost", "127.0.0.1")
        if alias not in CORS_ORIGINS:
            CORS_ORIGINS.append(alias)
    elif origin in {"http://127.0.0.1:5173", "http://127.0.0.1:5174"}:
        alias = origin.replace("127.0.0.1", "localhost")
        if alias not in CORS_ORIGINS:
            CORS_ORIGINS.append(alias)

DEFAULT_NOTE_CONTENT = {"type": "doc", "content": [{"type": "paragraph"}]}
ALLOWED_ROLES = {"user", "admin"}

try:
    MAX_ATTACHMENT_MB = max(1, int(os.getenv("MAX_ATTACHMENT_MB", "20")))
except ValueError:
    MAX_ATTACHMENT_MB = 20
MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024

app = FastAPI(
    title="ChauleNotes API",
    description="Every thought has a place. Python security guard for Firebase.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    # Credentials cannot be combined with a "*" origin in browsers. Normal
    # deployments list explicit origins in CORS_ORIGINS instead.
    allow_credentials=bool(CORS_ORIGINS),
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)


class AttachmentFolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: Optional[str] = None


class AttachmentFolderRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class AttachmentFolderMove(BaseModel):
    parent_id: Optional[str] = None


class AttachmentRename(BaseModel):
    file_name: str = Field(min_length=1, max_length=120)


class AttachmentMove(BaseModel):
    folder_id: Optional[str] = None


class NoteCreate(BaseModel):
    title: str = Field(default="Untitled Page", max_length=300)
    content: Optional[Dict[str, Any]] = None
    parent_id: Optional[str] = None
    workspace_id: Optional[str] = None
    is_favorite: bool = False
    is_archived: bool = False
    icon: Optional[str] = None
    cover_image: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=300)
    content: Optional[Dict[str, Any]] = None
    parent_id: Optional[str] = None
    workspace_id: Optional[str] = None
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None
    is_trashed: Optional[bool] = None
    icon: Optional[str] = None
    cover_image: Optional[str] = None
    tags: Optional[List[str]] = None


class TaskCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    priority: str = Field(default="medium")
    due_date: Optional[str] = None
    page_id: Optional[str] = None
    is_completed: bool = False


class TaskUpdate(BaseModel):
    content: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    priority: Optional[str] = None
    due_date: Optional[str] = None
    page_id: Optional[str] = None
    is_completed: Optional[bool] = None


class RoleUpdate(BaseModel):
    role: str


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    """Timestamps are stored as ISO strings so React's Date() can parse them."""
    return datetime.now(timezone.utc).isoformat()


def require_db():
    """
    FastAPI dependency that returns Firestore or a friendly 503 error.

    This keeps the API bootable even when a beginner has not added
    serviceAccountKey.json yet, and /health explains what is missing.
    """
    try:
        return get_db()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Firestore is not ready. Check the backend service-account credentials, "
                "enable the Cloud Firestore API, and create a Firestore database. "
                f"Details: {exc}"
            ),
        ) from exc


def _normalise_role(role: Optional[str]) -> str:
    role = (role or "user").lower().strip()
    return role if role in ALLOWED_ROLES else "user"


def _email_username(email: str) -> str:
    return (email.split("@")[0] if email else "User").strip() or "User"


def _public_user(profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Return ONLY safe, public profile fields. Passwords never exist here - Firebase
    Auth stores them separately and never exposes them through the Admin SDK.
    """
    email = profile.get("email") or ""
    username = profile.get("username") or _email_username(email)
    role = _normalise_role(profile.get("role"))
    return {
        "id": profile.get("id"),
        "email": email,
        "username": username,
        "role": role,
        "avatar_url": profile.get("avatar_url"),
        "theme_preference": profile.get("theme_preference", "system"),
        "created_at": profile.get("created_at"),
        "updated_at": profile.get("updated_at"),
        # Kept for compatibility with the React components from Phases 1-8.
        "user_metadata": {"username": username, "role": role},
        "app_metadata": {"role": role},
    }


def _profile_for_uid(db, uid: str, fallback_email: Optional[str] = None) -> Dict[str, Any]:
    """Load a profile; create a safe default if an older Auth user has none."""
    doc_ref = db.collection(COLLECTIONS["profiles"]).document(uid)
    snapshot = doc_ref.get()
    if snapshot.exists:
        profile = snapshot.to_dict() or {}
        profile["id"] = uid
        if not profile.get("workspace_id"):
            workspace_ref = db.collection(COLLECTIONS["workspaces"]).document()
            workspace_ref.set({"name": "Personal", "owner_id": uid, "created_at": now_iso()})
            doc_ref.update({"workspace_id": workspace_ref.id, "updated_at": now_iso()})
            profile["workspace_id"] = workspace_ref.id
        return profile

    email = fallback_email or ""
    username = _email_username(email)
    try:
        record = get_auth().get_user(uid)
        email = record.email or email
        username = record.display_name or _email_username(email)
    except Exception:  # noqa: BLE001 - profile can still be created
        pass

    role = "admin" if email.lower() in ADMIN_EMAILS else "user"
    timestamp = now_iso()
    workspace_ref = db.collection(COLLECTIONS["workspaces"]).document()
    profile = {
        "id": uid,
        "username": username,
        "email": email,
        "role": role,
        "avatar_url": None,
        "theme_preference": "system",
        "workspace_id": workspace_ref.id,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    doc_ref.set(profile, merge=True)
    workspace_ref.set({"name": "Personal", "owner_id": uid, "created_at": timestamp})
    return profile


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db=Depends(require_db),
) -> Dict[str, Any]:
    """Verify a Firebase-issued ID token, then load the current Firestore role."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Send an Authorization: Bearer <token> header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # Firebase Admin checks issuer, signature, audience, and expiry.
        payload = get_auth().verify_id_token(credentials.credentials, check_revoked=True)
    except Exception as exc:  # noqa: BLE001
        logger.info("Rejected Firebase ID token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your Firebase session is invalid or expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    profile = _profile_for_uid(db, uid, fallback_email=payload.get("email"))
    user = _public_user(profile)
    user["id"] = uid
    return user


def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Replacement for Supabase's `is_admin()` RLS helper."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required for this action.",
        )
    return user


def _log_admin_action(
    db,
    admin_id: str,
    action: str,
    target_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Record admin activity (the `admin_logs` collection from Phase 3/5/8)."""
    try:
        db.collection(COLLECTIONS["admin_logs"]).document().set(
            {
                "admin_id": admin_id,
                "action": action,
                "target_id": target_id,
                "details": details or {},
                "created_at": now_iso(),
            }
        )
    except Exception as exc:  # noqa: BLE001 - logging must never break the request
        logger.warning("Could not write admin log: %s", exc)


def _doc_to_note(snapshot) -> Dict[str, Any]:
    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    data.setdefault("title", "Untitled Page")
    data.setdefault("content", DEFAULT_NOTE_CONTENT)
    data.setdefault("parent_id", None)
    data.setdefault("workspace_id", None)
    data.setdefault("is_favorite", False)
    data.setdefault("is_archived", False)
    data.setdefault("is_trashed", False)
    data.setdefault("icon", None)
    data.setdefault("cover_image", None)
    data.setdefault("tags", [])
    return data


def _doc_to_task(snapshot) -> Dict[str, Any]:
    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    data.setdefault("content", "")
    data.setdefault("is_completed", False)
    data.setdefault("priority", "medium")
    data.setdefault("due_date", None)
    data.setdefault("page_id", None)
    return data


def _doc_to_attachment(snapshot) -> Dict[str, Any]:
    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    data.setdefault("page_id", None)
    data.setdefault("owner_id", None)
    data.setdefault("file_name", "file")
    data.setdefault("file_type", "application/octet-stream")
    data.setdefault("size", 0)
    data.setdefault("bucket_path", None)
    data.setdefault("folder_id", None)
    data.setdefault("storage_provider", None)
    data.setdefault("download_url", None)
    data.setdefault("created_at", None)
    return data


def _safe_attachment_name(filename: Optional[str]) -> str:
    """Strip folders and unsafe characters from an uploaded file name."""
    base = os.path.basename((filename or "file").replace("\\", "/"))
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    return (cleaned or "file")[:120]


def _delete_attachments_for_note(db, note_id: str) -> None:
    """
    Remove attachment metadata for a note and, when Storage is enabled, its blob.

    Storage is optional: on Spark this only deletes Firestore metadata and never
    touches a Storage bucket.
    """
    for snapshot in (
        db.collection(COLLECTIONS["attachments"])
        .where("page_id", "==", note_id)
        .stream()
    ):
        data = snapshot.to_dict() or {}
        bucket_path = data.get("bucket_path")
        if bucket_path and data.get("storage_provider") == "supabase" and is_storage_configured():
            try:
                get_storage_bucket().remove([bucket_path])
            except Exception as exc:  # noqa: BLE001 - metadata cleanup continues
                logger.warning("Could not delete Storage blob %s: %s", bucket_path, exc)
        snapshot.reference.delete()


def _content_text(content: Any) -> str:
    """Flatten Tiptap JSON to plain text for simple search."""
    parts: List[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "text" and isinstance(node.get("text"), str):
                parts.append(node["text"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(content)
    return " ".join(parts)


def _find_note(db, note_id: str) -> Dict[str, Any]:
    snapshot = db.collection(COLLECTIONS["pages"]).document(note_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Note not found.")
    return _doc_to_note(snapshot)


def _assert_note_access(note: Dict[str, Any], user: Dict[str, Any]) -> None:
    if note.get("owner_id") != user["id"] and user.get("role") != "admin":
        # 404 (not 403) avoids leaking whether another user's note exists.
        raise HTTPException(status_code=404, detail="Note not found.")


def _apply_note_update(
    db,
    note_id: str,
    updates: Dict[str, Any],
    actor_id: str,
) -> Dict[str, Any]:
    allowed = {
        "title",
        "content",
        "parent_id",
        "workspace_id",
        "is_favorite",
        "is_archived",
        "is_trashed",
        "icon",
        "cover_image",
        "tags",
    }
    clean = {key: value for key, value in updates.items() if key in allowed}

    if "title" in clean and not (clean.get("title") or "").strip():
        clean["title"] = "Untitled Page"
    if "title" in clean:
        clean["title"] = clean["title"].strip()
    if "content" in clean and clean["content"] is None:
        clean["content"] = DEFAULT_NOTE_CONTENT
    if "tags" in clean and clean["tags"] is None:
        clean["tags"] = []

    clean["updated_at"] = now_iso()
    clean["updated_by"] = actor_id

    db.collection(COLLECTIONS["pages"]).document(note_id).update(clean)
    return _find_note(db, note_id)


def _count(db, collection: str, field: Optional[str] = None, value: Any = None) -> int:
    """Use Firestore's count aggregation when available, else stream."""
    try:
        query = db.collection(collection)
        if field is not None:
            query = query.where(field, "==", value)
        result = query.count().get()
        return int(result[0][0].value)
    except Exception:  # noqa: BLE001 - older Admin SDK fallback
        try:
            query = db.collection(collection)
            if field is not None:
                query = query.where(field, "==", value)
            return sum(1 for _ in query.stream())
        except Exception:  # noqa: BLE001
            return 0


def _safe_iso_from_ms(value: Optional[int]) -> Optional[str]:
    if not value:
        return None
    try:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    except (ValueError, OSError):
        return None


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
# Firebase is initialized lazily by `get_db()` / `get_auth()`. This lets the
# API, root page, and OpenAPI docs start without Firebase credentials configured.


# ---------------------------------------------------------------------------
# Health / branding
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
def root() -> Dict[str, Any]:
    return {
        "name": "ChauleNotes API",
        "tagline": "Every thought has a place.",
        "founder": "Sajal Chaulagain (Mr. Chaule)",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health() -> Dict[str, Any]:
    try:
        db = get_db()
        db.collection("_meta").document("schema").get()
        return {
            "status": "ok",
            "firebase": "connected",
            "project_id": get_project_id(),
            "collections": list(COLLECTIONS.values()),
            "storage": storage_status(),
        }
    except Exception as exc:  # noqa: BLE001
        error_text = str(exc)
        if "SERVICE_DISABLED" in error_text or "firestore.googleapis.com" in error_text:
            hint = (
                "Enable the Cloud Firestore API for this Firebase project and create "
                "a Firestore database in the Firebase Console."
            )
        else:
            hint = (
                "Verify the backend service-account key and project permissions, "
                "then check that a Firestore database exists."
            )
        return {
            "status": "degraded",
            "firebase": "not connected",
            "detail": error_text,
            "hint": hint,
            "storage": storage_status(),
        }


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------
@app.post("/auth/register", status_code=201, tags=["Auth"])
def register(
    payload: RegisterRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    """
    Create a Firestore profile/workspace for the already authenticated Firebase user.
    Firebase Auth owns passwords; this API never accepts or stores them.
    """
    uid = user["id"]
    email = (user.get("email") or "").strip().lower()
    profile_ref = db.collection(COLLECTIONS["profiles"]).document(uid)
    existing = profile_ref.get()
    if existing.exists:
        profile = existing.to_dict() or {}
        if not profile.get("workspace_id") or profile.get("username") != payload.username.strip():
            patch = {"username": payload.username.strip(), "updated_at": now_iso()}
            if not profile.get("workspace_id"):
                workspace_ref = db.collection(COLLECTIONS["workspaces"]).document()
                workspace_ref.set({"name": "Personal", "owner_id": uid, "created_at": now_iso()})
                patch["workspace_id"] = workspace_ref.id
                profile["workspace_id"] = workspace_ref.id
            profile_ref.update(patch)
            profile.update(patch)
        profile["id"] = uid
        return {"user": _public_user(profile)}
    firebase_auth = get_auth()
    timestamp = now_iso()
    role = "admin" if email in ADMIN_EMAILS else "user"
    workspace_ref = db.collection(COLLECTIONS["workspaces"]).document()
    profile = {
        "id": uid,
        "username": payload.username.strip(),
        "email": email,
        "role": role,
        "avatar_url": None,
        "theme_preference": "system",
        "workspace_id": workspace_ref.id,
        "created_at": timestamp,
        "updated_at": timestamp,
    }

    try:
        batch = db.batch()
        batch.set(profile_ref, profile)
        batch.set(
            workspace_ref,
            {
                "name": "Personal",
                "owner_id": uid,
                "created_at": timestamp,
            },
        )
        batch.commit()
        if role == "admin":
            firebase_auth.set_custom_user_claims(uid, {"role": "admin"})
    except Exception as exc:  # noqa: BLE001
        # A Firestore permission/API/configuration error here used to surface as an
        # opaque 500. The full exception stays in the backend log for diagnosis.
        logger.exception("Firestore profile/workspace write failed for uid %s: %s", uid, exc)
        raise HTTPException(
            status_code=500,
            detail="Firebase Auth created the account, but Firestore could not save its profile. Check Firestore setup and backend service-account IAM access, then review the backend log.",
        ) from exc

    return {"user": _public_user(profile)}


@app.get("/auth/me", tags=["Auth"])
def auth_me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return {"user": user}


@app.get("/admin/me", tags=["Admin"])
def admin_me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Used by AuthContext to decide whether to show the Admin Panel link."""
    return {"user": user, "is_admin": user.get("role") == "admin"}


# ---------------------------------------------------------------------------
# NOTES / PAGES CRUD (owner-scoped; admins use /admin/notes for all notes)
# ---------------------------------------------------------------------------
@app.get("/notes", tags=["Notes"])
def list_notes(
    is_favorite: Optional[bool] = Query(default=None),
    is_archived: Optional[bool] = Query(default=None),
    is_trashed: Optional[bool] = Query(default=None),
    parent_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> List[Dict[str, Any]]:
    """
    List the signed-in user's notes.

    We filter in Python instead of Firestore to avoid composite-index setup for
    a beginner project. For very large workspaces, add Firestore indexes or
    pagination later (the `limit` parameter is already here).
    """
    notes = [
        _doc_to_note(doc)
        for doc in db.collection(COLLECTIONS["pages"])
        .where("owner_id", "==", user["id"])
        .stream()
    ]

    if is_favorite is not None:
        notes = [note for note in notes if bool(note.get("is_favorite")) == is_favorite]
    if is_archived is not None:
        notes = [note for note in notes if bool(note.get("is_archived")) == is_archived]
    if is_trashed is not None:
        notes = [note for note in notes if bool(note.get("is_trashed")) == is_trashed]
    if parent_id is not None:
        notes = [note for note in notes if note.get("parent_id") == parent_id]
    if search:
        query = search.strip().lower()
        notes = [
            note
            for note in notes
            if query in (note.get("title") or "").lower()
            or query in _content_text(note.get("content")).lower()
        ]

    notes.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    return notes[:limit]


@app.get("/notes/{note_id}", tags=["Notes"])
def get_note(
    note_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    note = _find_note(db, note_id)
    _assert_note_access(note, user)
    return note


@app.post("/notes", status_code=201, tags=["Notes"])
def create_note(
    payload: NoteCreate,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    doc_ref = db.collection(COLLECTIONS["pages"]).document()
    timestamp = now_iso()
    note = {
        "title": (payload.title or "Untitled Page").strip() or "Untitled Page",
        "content": payload.content or DEFAULT_NOTE_CONTENT,
        "parent_id": payload.parent_id,
        "workspace_id": payload.workspace_id,
        "owner_id": user["id"],
        "is_favorite": payload.is_favorite,
        "is_archived": payload.is_archived,
        "is_trashed": False,
        "icon": payload.icon,
        "cover_image": payload.cover_image,
        "tags": payload.tags or [],
        "created_at": timestamp,
        "updated_at": timestamp,
        "updated_by": user["id"],
    }
    doc_ref.set(note)
    note["id"] = doc_ref.id
    return note


@app.put("/notes/{note_id}", tags=["Notes"])
def update_note(
    note_id: str,
    payload: NoteUpdate,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    """Used by the editor + autosave: PUT /notes/{id}."""
    note = _find_note(db, note_id)
    _assert_note_access(note, user)
    updates = payload.model_dump(exclude_unset=True)
    return _apply_note_update(db, note_id, updates, user["id"])


@app.delete("/notes/{note_id}", tags=["Notes"])
def delete_note_permanently(
    note_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, str]:
    """Permanent delete. Moving to trash is a PUT with is_trashed=true."""
    note = _find_note(db, note_id)
    _assert_note_access(note, user)

    # Firestore has no cascading deletes, so clean up child records manually.
    for task in (
        db.collection(COLLECTIONS["tasks"]).where("page_id", "==", note_id).stream()
    ):
        task.reference.delete()
    _delete_attachments_for_note(db, note_id)

    db.collection(COLLECTIONS["pages"]).document(note_id).delete()
    return {"message": "Note deleted permanently."}


# ---------------------------------------------------------------------------
# ATTACHMENTS (OPTIONAL - private Supabase Storage)
# ---------------------------------------------------------------------------
# On the free Spark plan these endpoints remain harmless: they report that
# Storage is not configured and the React UI disables the upload button. Auth,
# notes, and tasks are completely independent of Storage.
@app.get("/attachments/config", tags=["Attachments"])
def attachment_config() -> Dict[str, Any]:
    """Public capability check used by the attachment panel."""
    return storage_status()


def _owned_folder(db, folder_id: str, owner_id: str) -> Dict[str, Any]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", folder_id):
        raise HTTPException(status_code=404, detail="Folder not found.")
    snapshot = db.collection("attachment_folders").document(folder_id).get()
    folder = snapshot.to_dict() or {}
    if not snapshot.exists or folder.get("owner_id") != owner_id:
        raise HTTPException(status_code=404, detail="Folder not found.")
    folder["id"] = snapshot.id
    return folder


@app.get("/attachments/folders", tags=["Attachments"])
def list_attachment_folders(
    parent_id: Optional[str] = Query(default=None),
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> List[Dict[str, Any]]:
    if parent_id:
        _owned_folder(db, parent_id, user["id"])
    folders = []
    for snapshot in db.collection("attachment_folders").where("owner_id", "==", user["id"]).stream():
        item = snapshot.to_dict() or {}
        if item.get("parent_id") == parent_id:
            item["id"] = snapshot.id
            folders.append(item)
    return sorted(folders, key=lambda item: item.get("name", "").lower())


@app.get("/attachments/folders/tree", tags=["Attachments"])
def attachment_folder_tree(
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> List[Dict[str, Any]]:
    """Return only this user's folder metadata with readable breadcrumb paths."""
    items = []
    for snapshot in db.collection(COLLECTIONS["attachment_folders"]).where("owner_id", "==", user["id"]).stream():
        folder = snapshot.to_dict() or {}
        folder["id"] = snapshot.id
        items.append(folder)
    by_id = {item["id"]: item for item in items}

    def path_for(folder: Dict[str, Any], seen: Optional[set] = None) -> str:
        seen = seen or set()
        if folder["id"] in seen:
            return folder.get("name", "")
        seen.add(folder["id"])
        parent = by_id.get(folder.get("parent_id"))
        return f"{path_for(parent, seen)}/{folder['name']}" if parent else folder["name"]

    for item in items:
        item["path"] = path_for(item)
    return sorted(items, key=lambda item: item["path"].lower())


@app.post("/attachments/folders", status_code=201, tags=["Attachments"])
def create_attachment_folder(
    payload: AttachmentFolderCreate,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    name = payload.name.strip()
    if not name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Folder name must be a single non-empty name.")
    if payload.parent_id:
        _owned_folder(db, payload.parent_id, user["id"])
    ref = db.collection("attachment_folders").document()
    timestamp = now_iso()
    folder = {"owner_id": user["id"], "name": name, "parent_id": payload.parent_id,
              "created_at": timestamp, "updated_at": timestamp}
    ref.set(folder)
    folder["id"] = ref.id
    return folder


@app.put("/attachments/folders/{folder_id}", tags=["Attachments"])
def rename_attachment_folder(
    folder_id: str,
    payload: AttachmentFolderRename,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    name = payload.name.strip()
    if not name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Folder name must be a single non-empty name.")
    folder = _owned_folder(db, folder_id, user["id"])
    folder.update({"name": name, "updated_at": now_iso()})
    db.collection("attachment_folders").document(folder_id).update(folder)
    return folder


@app.put("/attachments/folders/{folder_id}/move", tags=["Attachments"])
def move_attachment_folder(
    folder_id: str,
    payload: AttachmentFolderMove,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    folder = _owned_folder(db, folder_id, user["id"])
    if payload.parent_id == folder_id:
        raise HTTPException(status_code=400, detail="A folder cannot be moved inside itself.")
    if payload.parent_id:
        parent = _owned_folder(db, payload.parent_id, user["id"])
        # Walk parent pointers so moving into a descendant cannot create a cycle.
        cursor = parent
        while cursor.get("parent_id"):
            if cursor["parent_id"] == folder_id:
                raise HTTPException(status_code=400, detail="A folder cannot be moved inside its own child.")
            cursor = _owned_folder(db, cursor["parent_id"], user["id"])
    folder.update({"parent_id": payload.parent_id, "updated_at": now_iso()})
    db.collection("attachment_folders").document(folder_id).update(folder)
    return folder


@app.delete("/attachments/folders/{folder_id}", tags=["Attachments"])
def delete_attachment_folder(
    folder_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, str]:
    _owned_folder(db, folder_id, user["id"])
    if list(db.collection("attachment_folders").where("parent_id", "==", folder_id).limit(1).stream()):
        raise HTTPException(status_code=409, detail="Move or delete this folder's child folders first.")
    if list(db.collection(COLLECTIONS["attachments"]).where("folder_id", "==", folder_id).limit(1).stream()):
        raise HTTPException(status_code=409, detail="Move or delete files in this folder first.")
    db.collection("attachment_folders").document(folder_id).delete()
    return {"message": "Folder deleted."}


@app.get("/notes/{note_id}/attachments", tags=["Attachments"])
def list_note_attachments(
    note_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> List[Dict[str, Any]]:
    note = _find_note(db, note_id)
    _assert_note_access(note, user)

    attachments = [
        _doc_to_attachment(snapshot)
        for snapshot in (
            db.collection(COLLECTIONS["attachments"])
            .where("page_id", "==", note_id)
            .stream()
        )
    ]
    for item in attachments:
        item["download_url"] = None
        if item.get("storage_provider") != "supabase" or not is_storage_configured():
            continue
        try:
            item["download_url"] = signed_download_url(item["bucket_path"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not sign attachment %s: %s", item.get("id"), exc)
            item["download_url"] = None
    attachments.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return attachments


@app.post("/notes/{note_id}/attachments", status_code=201, tags=["Attachments"])
async def upload_note_attachment(
    note_id: str,
    file: UploadFile = File(...),
    folder_id: Optional[str] = Form(default=None),
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    """
    Upload one optional attachment for a note.

    If Supabase Storage is not configured, this returns a
    clear 503 message instead of crashing the app or touching Storage.
    """
    note = _find_note(db, note_id)
    _assert_note_access(note, user)

    if not is_storage_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=storage_status()["message"],
        )

    if folder_id:
        folder_snapshot = db.collection("attachment_folders").document(folder_id).get()
        folder = folder_snapshot.to_dict() or {}
        if not folder_snapshot.exists or folder.get("owner_id") != user["id"]:
            raise HTTPException(status_code=404, detail="Folder not found.")

    payload = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The selected file is empty.")
    if len(payload) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large. The maximum attachment size is {MAX_ATTACHMENT_MB} MB.",
        )

    filename = _safe_attachment_name(file.filename)
    content_type = file.content_type or "application/octet-stream"
    allowed_extensions = {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        ".txt", ".csv", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".zip",
    }
    extension = os.path.splitext(filename)[1].lower()
    if extension not in allowed_extensions:
        raise HTTPException(status_code=415, detail="This file type is not supported.")
    # Catch common spoofed uploads while allowing office formats and text formats
    # whose content does not have one universal magic signature.
    signatures = {
        ".pdf": payload.startswith(b"%PDF-"),
        ".png": payload.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": payload.startswith(b"\xff\xd8\xff"),
        ".jpeg": payload.startswith(b"\xff\xd8\xff"),
        ".gif": payload.startswith((b"GIF87a", b"GIF89a")),
        ".webp": len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP",
        ".zip": payload.startswith(b"PK\x03\x04"),
        ".docx": payload.startswith(b"PK\x03\x04"),
        ".xlsx": payload.startswith(b"PK\x03\x04"),
        ".pptx": payload.startswith(b"PK\x03\x04"),
        ".doc": payload.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        ".xls": payload.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        ".ppt": payload.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
    }
    if extension in signatures and not signatures[extension]:
        raise HTTPException(status_code=415, detail="The file contents do not match the selected file type.")
    if extension in {".txt", ".csv"} and b"\x00" in payload:
        raise HTTPException(status_code=415, detail="This text file contains binary data and cannot be uploaded.")
    if folder_id:
        _owned_folder(db, folder_id, user["id"])
    # Storage keys use verified UIDs and random segments; folder names stay in
    # Firestore metadata, so browser paths can never escape a user's prefix.
    blob_path = f"{user['id']}/{folder_id or 'root'}/{uuid.uuid4().hex}-{filename}"

    try:
        bucket = get_storage_bucket()
        bucket.upload(blob_path, payload, {"content-type": content_type, "upsert": "false"})
    except StorageNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Supabase Storage upload failed for UID %s: %s", user["id"], exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Storage could not accept the upload. Verify that the private bucket exists and backend credentials are valid.",
        ) from exc

    timestamp = now_iso()
    doc_ref = db.collection(COLLECTIONS["attachments"]).document()
    record = {
        "page_id": note_id,
        "owner_id": user["id"],
        "file_name": filename,
        "file_type": content_type,
        "size": len(payload),
        "bucket_path": blob_path,
        "storage_provider": "supabase",
        "download_url": None,
        "folder_id": folder_id,
        "created_at": timestamp,
    }

    try:
        doc_ref.set(record)
    except Exception as exc:  # noqa: BLE001
        # Do not leave an orphaned blob if Firestore metadata cannot be saved.
        try:
            bucket.remove([blob_path])
        except Exception:  # noqa: BLE001
            pass
        raise HTTPException(
            status_code=500,
            detail=f"File uploaded but attachment metadata could not be saved: {exc}",
        ) from exc

    record["id"] = doc_ref.id
    try:
        record["download_url"] = signed_download_url(blob_path)
    except Exception as exc:  # noqa: BLE001 - the saved file remains listable
        logger.warning("Upload succeeded but signing URL failed for %s: %s", doc_ref.id, exc)
    return record


@app.delete("/attachments/{attachment_id}", tags=["Attachments"])
def delete_attachment(
    attachment_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, str]:
    ref = db.collection(COLLECTIONS["attachments"]).document(attachment_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Attachment not found.")

    attachment = _doc_to_attachment(snapshot)
    if (
        attachment.get("owner_id") != user["id"]
        and user.get("role") != "admin"
    ):
        # 404 avoids leaking another user's attachment metadata.
        raise HTTPException(status_code=404, detail="Attachment not found.")

    bucket_path = attachment.get("bucket_path")
    if bucket_path and attachment.get("storage_provider") == "supabase" and is_storage_configured():
        try:
            get_storage_bucket().remove([bucket_path])
        except Exception as exc:  # noqa: BLE001 - keep metadata so the user can retry
            logger.exception("Supabase Storage delete failed for attachment %s", attachment_id)
            raise HTTPException(status_code=502, detail="Storage could not delete this file. Its attachment record was kept so you can retry.") from exc

    ref.delete()
    return {"message": "Attachment deleted."}


@app.put("/attachments/{attachment_id}", tags=["Attachments"])
def rename_attachment(
    attachment_id: str,
    payload: AttachmentRename,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    ref = db.collection(COLLECTIONS["attachments"]).document(attachment_id)
    snapshot = ref.get()
    attachment = _doc_to_attachment(snapshot) if snapshot.exists else {}
    if not snapshot.exists or attachment.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    new_name = _safe_attachment_name(payload.file_name)
    if not new_name or new_name != payload.file_name.strip():
        raise HTTPException(status_code=400, detail="Enter a filename without folders or unsupported characters.")
    if os.path.splitext(new_name)[1].lower() not in {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv",
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".zip",
    }:
        raise HTTPException(status_code=415, detail="This file type is not supported.")
    if os.path.splitext(new_name)[1].lower() != os.path.splitext(attachment.get("file_name", ""))[1].lower():
        raise HTTPException(status_code=400, detail="Keep the existing file extension when renaming an attachment.")
    old_path = attachment.get("bucket_path")
    if old_path and is_storage_configured():
        old_base = old_path.rsplit("/", 1)[-1]
        prefix = old_base.split("-", 1)[0]
        new_path = f"{old_path.rsplit('/', 1)[0]}/{prefix}-{new_name}"
        try:
            get_storage_bucket().move(old_path, new_path)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Supabase Storage rename failed for attachment %s", attachment_id)
            raise HTTPException(status_code=502, detail="Storage could not rename this attachment.") from exc
        old_path = new_path
    ref.update({"file_name": new_name, "bucket_path": old_path, "updated_at": now_iso()})
    updated = _doc_to_attachment(ref.get())
    updated["download_url"] = signed_download_url(old_path) if old_path and is_storage_configured() else None
    return updated


@app.patch("/attachments/{attachment_id}/move", tags=["Attachments"])
def move_attachment(
    attachment_id: str,
    payload: AttachmentMove,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    ref = db.collection(COLLECTIONS["attachments"]).document(attachment_id)
    snapshot = ref.get()
    attachment = _doc_to_attachment(snapshot) if snapshot.exists else {}
    if not snapshot.exists or attachment.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    if payload.folder_id:
        _owned_folder(db, payload.folder_id, user["id"])
    old_path = attachment.get("bucket_path")
    if old_path and is_storage_configured():
        current_name = old_path.rsplit("/", 1)[-1]
        new_path = f"{user['id']}/{payload.folder_id or 'root'}/{current_name}"
        try:
            get_storage_bucket().move(old_path, new_path)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Supabase Storage move failed for attachment %s", attachment_id)
            raise HTTPException(status_code=502, detail="Storage could not move this attachment.") from exc
        old_path = new_path
    ref.update({"folder_id": payload.folder_id, "bucket_path": old_path, "updated_at": now_iso()})
    updated = _doc_to_attachment(ref.get())
    updated["download_url"] = signed_download_url(old_path) if old_path and is_storage_configured() else None
    return updated


# ---------------------------------------------------------------------------
# TASKS CRUD
# ---------------------------------------------------------------------------
@app.get("/tasks", tags=["Tasks"])
def list_tasks(
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> List[Dict[str, Any]]:
    tasks = [
        _doc_to_task(doc)
        for doc in db.collection(COLLECTIONS["tasks"])
        .where("owner_id", "==", user["id"])
        .stream()
    ]
    tasks.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return tasks


@app.post("/tasks", status_code=201, tags=["Tasks"])
def create_task(
    payload: TaskCreate,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    priority = payload.priority if payload.priority in {"low", "medium", "high"} else "medium"
    doc_ref = db.collection(COLLECTIONS["tasks"]).document()
    timestamp = now_iso()
    task = {
        "content": payload.content.strip(),
        "owner_id": user["id"],
        "page_id": payload.page_id,
        "is_completed": payload.is_completed,
        "priority": priority,
        "due_date": payload.due_date,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    doc_ref.set(task)
    task["id"] = doc_ref.id
    return task


@app.put("/tasks/{task_id}", tags=["Tasks"])
def update_task(
    task_id: str,
    payload: TaskUpdate,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, Any]:
    ref = db.collection(COLLECTIONS["tasks"]).document(task_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Task not found.")

    task = _doc_to_task(snapshot)
    if task.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=404, detail="Task not found.")

    updates = payload.model_dump(exclude_unset=True)
    if "priority" in updates and updates["priority"] not in {"low", "medium", "high"}:
        updates["priority"] = "medium"
    if "content" in updates and not (updates.get("content") or "").strip():
        raise HTTPException(status_code=400, detail="Task text cannot be empty.")
    updates["updated_at"] = now_iso()

    ref.update(updates)
    return _doc_to_task(ref.get())


@app.delete("/tasks/{task_id}", tags=["Tasks"])
def delete_task(
    task_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(require_db),
) -> Dict[str, str]:
    ref = db.collection(COLLECTIONS["tasks"]).document(task_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Task not found.")

    task = _doc_to_task(snapshot)
    if task.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=404, detail="Task not found.")

    ref.delete()
    return {"message": "Task deleted."}


# ---------------------------------------------------------------------------
# ADMIN - users, roles, stats, and full note flexibility
# ---------------------------------------------------------------------------
@app.get("/admin/users", tags=["Admin"])
def admin_list_users(
    admin: Dict[str, Any] = Depends(require_admin),
    db=Depends(require_db),
) -> Dict[str, Any]:
    """
    Admin flexibility: list every profile. We intentionally whitelist fields so
    passwords / private Auth data can never be returned.
    """
    profiles: List[Dict[str, Any]] = []
    for snapshot in db.collection(COLLECTIONS["profiles"]).stream():
        profile = snapshot.to_dict() or {}
        profile["id"] = snapshot.id
        profiles.append(profile)

    # Enrich with Auth metadata (disabled status, last sign-in) when available.
    auth_users: Dict[str, Any] = {}
    try:
        result = get_auth().list_users(max_results=1000)
        auth_users = {record.uid: record for record in getattr(result, "users", [])}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not list Firebase Auth users: %s", exc)

    safe_users: List[Dict[str, Any]] = []
    for profile in profiles:
        record = auth_users.get(profile["id"])
        metadata = getattr(record, "user_metadata", None) if record else None
        safe_users.append(
            {
                "id": profile["id"],
                "username": profile.get("username")
                or _email_username(profile.get("email", "")),
                "email": (getattr(record, "email", None) if record else None)
                or profile.get("email")
                or "",
                "role": _normalise_role(profile.get("role")),
                "avatar_url": profile.get("avatar_url"),
                "created_at": profile.get("created_at"),
                "last_sign_in_at": _safe_iso_from_ms(
                    getattr(metadata, "last_sign_in_timestamp", None)
                ),
                "disabled": bool(getattr(record, "disabled", False)) if record else False,
            }
        )

    safe_users.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"users": safe_users, "total": len(safe_users)}


@app.put("/admin/users/{user_id}/role", tags=["Admin"])
def admin_update_user_role(
    user_id: str,
    payload: RoleUpdate,
    admin: Dict[str, Any] = Depends(require_admin),
    db=Depends(require_db),
) -> Dict[str, Any]:
    """Toggle a member between `user` and `admin` (Phase 5/8 flexibility)."""
    role = _normalise_role(payload.role)
    if payload.role.lower().strip() not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'.")
    if user_id == admin["id"] and role != "admin":
        raise HTTPException(
            status_code=400,
            detail="You cannot remove your own admin role. Ask another admin to do it.",
        )

    ref = db.collection(COLLECTIONS["profiles"]).document(user_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="User not found.")

    current = snapshot.to_dict() or {}
    if current.get("role") == "admin" and role == "user":
        admin_count = _count(db, COLLECTIONS["profiles"], "role", "admin")
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="At least one admin must remain in the workspace.",
            )

    ref.update({"role": role, "updated_at": now_iso()})
    try:
        get_auth().set_custom_user_claims(user_id, {"role": role})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not update custom claims for %s: %s", user_id, exc)

    _log_admin_action(
        db,
        admin["id"],
        "role.updated",
        target_id=user_id,
        details={"from": current.get("role"), "to": role},
    )

    updated = ref.get().to_dict() or {}
    updated["id"] = user_id
    return {
        "message": f"Role updated to {role}.",
        "user": {
            "id": user_id,
            "username": updated.get("username"),
            "email": updated.get("email"),
            "role": role,
            "created_at": updated.get("created_at"),
        },
    }


@app.get("/admin/stats", tags=["Admin"])
def admin_stats(
    admin: Dict[str, Any] = Depends(require_admin),
    db=Depends(require_db),
) -> Dict[str, Any]:
    recent_logs = []
    try:
        logs = (
            db.collection(COLLECTIONS["admin_logs"])
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(15)
            .stream()
        )
        for snapshot in logs:
            entry = snapshot.to_dict() or {}
            entry["id"] = snapshot.id
            recent_logs.append(entry)
    except Exception:  # noqa: BLE001 - collection/index may not exist yet
        recent_logs = []

    return {
        "users": _count(db, COLLECTIONS["profiles"]),
        "admins": _count(db, COLLECTIONS["profiles"], "role", "admin"),
        "pages": _count(db, COLLECTIONS["pages"]),
        "tasks": _count(db, COLLECTIONS["tasks"]),
        "workspaces": _count(db, COLLECTIONS["workspaces"]),
        "attachments": _count(db, COLLECTIONS["attachments"]),
        "attachment_folders": _count(db, COLLECTIONS["attachment_folders"]),
        "admin_logs": _count(db, COLLECTIONS["admin_logs"]),
        "trashed_pages": _count(db, COLLECTIONS["pages"], "is_trashed", True),
        "project_id": get_project_id(),
        "collections": list(COLLECTIONS.values()),
        "recent_logs": recent_logs,
    }


@app.get("/admin/notes", tags=["Admin"])
def admin_list_notes(
    owner_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    admin: Dict[str, Any] = Depends(require_admin),
    db=Depends(require_db),
) -> Dict[str, Any]:
    """Admin flexibility: view every note in the workspace."""
    query = db.collection(COLLECTIONS["pages"])
    if owner_id:
        query = query.where("owner_id", "==", owner_id)

    notes = [_doc_to_note(doc) for doc in query.stream()]

    if search:
        needle = search.strip().lower()
        notes = [
            note
            for note in notes
            if needle in (note.get("title") or "").lower()
            or needle in _content_text(note.get("content")).lower()
        ]

    owner_names: Dict[str, str] = {}
    owner_emails: Dict[str, str] = {}
    for snapshot in db.collection(COLLECTIONS["profiles"]).stream():
        profile = snapshot.to_dict() or {}
        owner_names[snapshot.id] = profile.get("username") or profile.get("email") or ""
        owner_emails[snapshot.id] = profile.get("email") or ""

    for note in notes:
        note["owner_name"] = owner_names.get(note.get("owner_id"), "Unknown")
        note["owner_email"] = owner_emails.get(note.get("owner_id"), "")

    notes.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    return {"notes": notes[:limit], "total": len(notes)}


@app.get("/admin/notes/{note_id}", tags=["Admin"])
def admin_get_note(
    note_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
    db=Depends(require_db),
) -> Dict[str, Any]:
    return _find_note(db, note_id)


@app.put("/admin/notes/{note_id}", tags=["Admin"])
def admin_update_note(
    note_id: str,
    payload: NoteUpdate,
    admin: Dict[str, Any] = Depends(require_admin),
    db=Depends(require_db),
) -> Dict[str, Any]:
    """Admins may edit any note, but passwords are never part of this model."""
    _find_note(db, note_id)
    updates = payload.model_dump(exclude_unset=True)
    note = _apply_note_update(db, note_id, updates, admin["id"])
    _log_admin_action(
        db,
        admin["id"],
        "note.updated",
        target_id=note_id,
        details={"fields": list(updates.keys())},
    )
    return note


@app.delete("/admin/notes/{note_id}", tags=["Admin"])
def admin_delete_note(
    note_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
    db=Depends(require_db),
) -> Dict[str, str]:
    """Admins can remove any note; the action is recorded in admin_logs."""
    note = _find_note(db, note_id)
    for task in (
        db.collection(COLLECTIONS["tasks"]).where("page_id", "==", note_id).stream()
    ):
        task.reference.delete()
    _delete_attachments_for_note(db, note_id)
    db.collection(COLLECTIONS["pages"]).document(note_id).delete()
    _log_admin_action(
        db,
        admin["id"],
        "note.deleted",
        target_id=note_id,
        details={"owner_id": note.get("owner_id"), "title": note.get("title")},
    )
    return {"message": "Note deleted by admin."}


@app.get("/admin/logs", tags=["Admin"])
def admin_logs(
    limit: int = Query(default=50, ge=1, le=500),
    admin: Dict[str, Any] = Depends(require_admin),
    db=Depends(require_db),
) -> List[Dict[str, Any]]:
    logs = []
    try:
        for snapshot in (
            db.collection(COLLECTIONS["admin_logs"])
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        ):
            entry = snapshot.to_dict() or {}
            entry["id"] = snapshot.id
            logs.append(entry)
    except Exception:  # noqa: BLE001
        return []
    return logs
