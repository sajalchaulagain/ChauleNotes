# ChauleNotes

**Every thought has a place.**

ChauleNotes is a Notion-inspired notes and productivity app. The frontend is React/Vite, the API is FastAPI, Firebase Authentication issues user ID tokens, and Cloud Firestore stores profiles, notes, workspaces, tasks, and attachment metadata. Optional file blobs use a private Supabase Storage bucket.

## Requirements

- Windows 11 with PowerShell
- Node.js 20 LTS or newer
- Python 3.12 or 3.13 recommended (the backend dependencies may also work on newer Python versions)
- A Firebase project with Email/Password Authentication and Firestore enabled

## Run locally (PowerShell)

Open two PowerShell terminals from the project directory `E:\ChauleNotes`.

### 1. Configure the frontend

```powershell
Copy-Item .env.example .env
notepad .env
```

Set the Firebase **web app** values from Firebase Console → Project settings → General → Your apps. Keep `VITE_PYTHON_API_URL=http://localhost:8000` for local development. These Firebase web identifiers are public; never put service-account or Supabase secret keys in this file or in any `VITE_` variable.

### 2. Configure and start the backend

```powershell
cd E:\ChauleNotes\backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

If PowerShell blocks activation for this terminal, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` and activate again. Save the Firebase Admin service account JSON as `backend\serviceAccountKey.json` (already auto-detected), or set `FIREBASE_CREDENTIALS_PATH=./serviceAccountKey.json`. Set `FIREBASE_PROJECT_ID` if the key does not provide the intended project. Do not commit either private file.

Set `CORS_ORIGINS=http://localhost:5173,http://localhost:5174` in `backend/.env`, then start the API:

```powershell
python -m uvicorn main:app --reload --port 8000
```

Check [http://localhost:8000/health](http://localhost:8000/health) and [http://localhost:8000/docs](http://localhost:8000/docs).

### 3. Start the frontend

In the second terminal:

```powershell
cd E:\ChauleNotes
npm install
npm run dev
```

Open the local URL Vite prints (normally [http://localhost:5173](http://localhost:5173)). Create an account from the registration page. Enable Email/Password under Firebase Console → Authentication → Sign-in method.

## Authentication and authorization

Firebase Authentication handles passwords, account creation, and password reset. The browser sends a Firebase-issued ID token over HTTPS; FastAPI verifies its signature, project audience, expiry, and revocation status with Firebase Admin. The backend then looks up the current role in the Firestore `profiles` document. Users cannot set their own role during registration. Set `ADMIN_EMAILS` in the backend environment for first-time admin assignment, or change a profile role through an existing admin account. Admin routes check the current Firestore role on every request.

Firebase ID tokens expire and the Firebase client refreshes them. Existing custom ChauleNotes sessions are no longer accepted; users must sign in again after this migration. Firebase's documented ID-token model is described in [Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## Optional file attachments (Supabase Storage)

Notes, authentication, and tasks work without Storage credentials; uploads are disabled when storage is not configured. To enable uploads:

1. Create a **private** bucket (default name `chaule-notes-files`) in Supabase Storage.
2. Put the project URL and a backend secret key in `backend/.env` only:

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   SUPABASE_STORAGE_BUCKET=chaule-notes-files
   MAX_ATTACHMENT_MB=20
   ```

3. Restart FastAPI. The backend generates short-lived signed download URLs and enforces account ownership for attachment operations. Never put the Supabase key into frontend config, source code, or a `VITE_` variable. Supabase documents private buckets and signed downloads [here](https://supabase.com/docs/guides/storage/serving/downloads).

The bucket was directly checked during maintenance with a temporary upload, download, signed URL, and deletion. That confirms the configured Supabase project and bucket are reachable. It does not substitute for an authenticated browser-to-API upload test.

## Environment variables

See [backend/.env.example](./backend/.env.example) and [.env.example](./.env.example). The key backend settings are:

| Variable | Required | Purpose |
| --- | --- | --- |
| `FIREBASE_CREDENTIALS_PATH` or default key file | Yes outside Google hosting | Firebase Admin credentials |
| `FIREBASE_PROJECT_ID` | Recommended | Firebase project selection |
| `ADMIN_EMAILS` | Optional | Emails to grant admin on profile creation |
| `CORS_ORIGINS` | Yes for deployment | Exact frontend origins allowed by FastAPI |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Optional | Private file storage, backend only |
| `SUPABASE_STORAGE_BUCKET` | Optional | Defaults to `chaule-notes-files` |

Never paste `.env` or service-account JSON contents into issues, chats, browser code, or GitHub. The root [`.gitignore`](./.gitignore) excludes these local secret files.

## Checks and development

Frontend checks:

```powershell
npm run lint
npm test -- --run
npm run build
```

Backend import check (from `backend` with `.venv` activated):

```powershell
python -c "from main import app; print(app.title)"
```

Interactive API docs are available at `/docs`. API route documentation is generated from the live FastAPI application; all authenticated routes require a Firebase ID token except health and attachment configuration status.

## Deployment checklist

- Set Firebase web app values as Vercel environment variables (`VITE_FIREBASE_*`) and the deployed API URL as `VITE_PYTHON_API_URL`.
- Deploy FastAPI separately; provide Firebase credentials using the host's secret manager (prefer workload identity/Application Default Credentials when available).
- Set `FIREBASE_PROJECT_ID`, `CORS_ORIGINS` to the exact deployed Vercel origin, and `ADMIN_EMAILS` on the API host.
- If enabling uploads, set Supabase values only in the API host's secret manager and keep the bucket private.
- Configure Firebase Authentication authorized domains for the deployed site.
- Restrict Firestore client rules because application data access is performed by the trusted backend Admin SDK; service-account IAM permissions should be least-privilege.
- Confirm backups, billing/quotas, log retention, rate limiting, and an account deletion/data retention policy before public launch.

## Current scope and known limits

- Core notes, tasks, auth, admin, and attachment endpoints exist. Role assignment is backend-controlled.
- PWA support is configured in the Vite project; verify installability and offline behavior against the deployed domain before announcing it.
- Only local Supabase SDK operations were directly verified during this maintenance. No live Firebase user registration/login, authenticated API upload, multi-user isolation, or deployed Vercel-to-API browser flow was performed here; those require testing with the project’s real account and deployed origins.
- Review `npm install` audit output before production. At the time dependencies were installed, npm reported 65 advisories (including 2 critical); run `npm audit` and review compatible fixes before deployment.
