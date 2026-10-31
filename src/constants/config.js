// ChauleNotes Branding Constants
export const BRAND_NAME = "ChauleNotes";
export const TAGLINE = "Every thought has a place.";
export const FOUNDER = "Sajal Chaulagain (Mr. Chaule)";

// ---------------------------------------------------------------------------
// Firebase + Python API configuration (Beginner: replace these in .env)
// ---------------------------------------------------------------------------
// WHY BOTH?
// - PYTHON_API_URL is the address React calls. Python is the security guard
//   (middleman) that verifies JWTs and talks to Firestore.
// - FIREBASE_CONFIG contains public web app values. Firebase Auth issues an
//   ID token here; FastAPI verifies it before accessing Firestore with Admin SDK.
//   NEVER put a Firebase service-account private key in this file.
//
// Firebase Console -> Project settings -> General -> Your apps -> Web app.
//
export const STORAGE_DISABLED_MESSAGE =
  "File attachments are disabled. Configure Supabase Storage credentials in backend/.env to enable uploads.";

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "your-firebase-web-api-key",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "your-project-id.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "your-project-id",
  // Storage credentials and provider configuration are backend-only.
  storageBucket: undefined,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:placeholder",
};

// Python FastAPI backend. Local default matches `uvicorn main:app --port 8000`.
export const PYTHON_API_URL =
  import.meta.env.VITE_PYTHON_API_URL || "http://localhost:8000";

// Editor Configuration (Tiptap)
export const EDITOR_PLACEHOLDER = "Start writing... / for commands";
export const AUTOSAVE_DELAY = 2000; // 2 seconds pause before saving
