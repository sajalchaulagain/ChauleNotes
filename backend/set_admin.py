"""
Promote an existing ChauleNotes user to admin.

Usage (from the backend folder, after backend/.env is configured):

    python set_admin.py founder@example.com

Why a script? Firestore does not have a SQL editor like Supabase. This gives the
founder a beginner-friendly way to create the first admin without clicking around
the Firebase Console. You can also edit `role` manually in Firestore.
"""

from __future__ import annotations

import sys

try:
    from .firebase_config import COLLECTIONS, get_auth, get_db, initialize_firebase
except ImportError:  # python set_admin.py
    from firebase_config import COLLECTIONS, get_auth, get_db, initialize_firebase  # type: ignore


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python set_admin.py user@example.com")
        return 1

    email = sys.argv[1].strip().lower()
    initialize_firebase()
    db = get_db()
    profiles = db.collection(COLLECTIONS["profiles"])
    matches = list(profiles.where("email", "==", email).limit(1).stream())

    if not matches:
        print(f"No profile found for {email}. Register the account in the app first.")
        return 1

    profile_ref = matches[0].reference
    profile_ref.update({"role": "admin"})

    uid = profile_ref.id
    try:
        get_auth().set_custom_user_claims(uid, {"role": "admin"})
    except Exception as exc:  # noqa: BLE001
        print(f"Profile updated, but custom claims failed (not fatal): {exc}")

    print(f"Success: {email} is now an admin (uid: {uid}).")
    print("Sign out and back in so the frontend refreshes the role.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
