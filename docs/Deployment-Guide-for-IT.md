# Live Commerce Platform — Deployment Guide for IT

**Version:** 2.0 (Post-Migration)  
**Date:** 2026-05-11  
**Prepared by:** Development Team  
**Target:** Google Cloud Run (asia-southeast1)

---

## Table of Contents

1. [What Changed](#1-what-changed)
2. [Prerequisites](#2-prerequisites)
3. [Repository Structure](#3-repository-structure)
4. [Deployment Option A: Automated via Cloud Build (Recommended)](#4-deployment-option-a-automated-via-cloud-build)
5. [Deployment Option B: Manual CLI Deployment](#5-deployment-option-b-manual-cli-deployment)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Post-Deployment Verification](#7-post-deployment-verification)
8. [Troubleshooting](#8-troubleshooting)
9. [Future: Migrating to Cloud SQL](#9-future-migrating-to-cloud-sql)

---

## 1. What Changed

The codebase has been significantly updated since the last deployment. Key changes:

| Area | Before | After |
|------|--------|-------|
| **Database** | SQLite only | PostgreSQL primary, **SQLite automatic fallback** |
| **Authentication** | JWT in localStorage | JWT in HttpOnly Secure Cookies |
| **CORS** | Permissive | Strict origin validation required |
| **Workflow Module** | Present (admin panel) | **Removed entirely** |
| **Column Mapping** | N/A | Auto camelCase conversion for PostgreSQL |

### Important: No Cloud SQL Required

The backend now **automatically detects** the database mode:
- If `PG_HOST` environment variable is set → connects to PostgreSQL
- If `PG_HOST` is **not set** → uses an embedded SQLite file (`data/local.db`)

**For this deployment, we are using SQLite fallback mode.** No Cloud SQL instance is needed.

> ⚠️ **Note:** SQLite data lives inside the container. If the Cloud Run revision is replaced, the SQLite data resets. This is acceptable for the current stage (demo/MVP). A future upgrade to Cloud SQL is planned.

---

## 2. Prerequisites

Ensure the following before proceeding:

- [ ] Access to GCP project: `dachin-live-commerce` (Project #416645281925)
- [ ] `gcloud` CLI installed and authenticated (`gcloud auth login`)
- [ ] Docker installed locally (only for Option B)
- [ ] Artifact Registry repository exists: `asia-southeast1-docker.pkg.dev/dachin-live-commerce/cloud-run-source-deploy`
- [ ] Secret `jwt-secret` exists in Secret Manager (already configured from previous deployment)
- [ ] Cloud Build API enabled
- [ ] Cloud Run API enabled

### Verify GCP Access

```bash
gcloud config set project dachin-live-commerce
gcloud projects describe dachin-live-commerce
```

---

## 3. Repository Structure

```
live-commerce/
├── backend/
│   ├── Dockerfile          ← NEW: Backend container definition
│   ├── .env.example        ← NEW: Environment variable reference
│   ├── src/
│   │   ├── database/
│   │   │   └── connection.ts  ← MODIFIED: Dual-backend (PG + SQLite)
│   │   ├── db.ts              ← MODIFIED: Cross-dialect compatible
│   │   └── index.ts           ← MODIFIED: Workflow routes removed
│   └── package.json           ← MODIFIED: added better-sqlite3
├── frontend/
│   ├── Dockerfile          ← NEW: Frontend container definition
│   └── src/
│       ├── App.tsx            ← MODIFIED: Workflow route removed
│       └── components/
│           └── Sidebar.tsx    ← MODIFIED: Workflow nav removed
├── cloudbuild.yaml         ← NEW: Cloud Build pipeline
├── .dockerignore           ← NEW: Docker build exclusions
└── docker-compose.db.yml   ← Existing (for local PG development)
```

---

## 4. Deployment Option A: Automated via Cloud Build

### Step 1: Connect Repository (if not already done)

In GCP Console → Cloud Build → Triggers:

1. Click **"Connect Repository"**
2. Select **GitHub** → Authorize → Choose `dachin-ai/live-commerce`
3. Create a trigger:
   - Name: `deploy-live-commerce`
   - Event: Push to branch `main`
   - Configuration: **Cloud Build configuration file** → `cloudbuild.yaml`

### Step 2: Trigger the Build

Either:
- **Push to `main`** branch (auto-triggers if configured)
- Or manually: GCP Console → Cloud Build → Triggers → **Run** on `deploy-live-commerce`

### Step 3: Monitor

```bash
# Watch the build in real-time
gcloud builds list --limit=5
gcloud builds log <BUILD_ID> --stream
```

Or monitor in GCP Console → Cloud Build → History.

### What the Pipeline Does (6 steps)

```
1. Build backend Docker image
2. Push backend image to Artifact Registry
3. Deploy backend to Cloud Run (live-commerce-api)
   → Injects: NODE_ENV, CORS_ORIGIN, JWT_SECRET
   → 512Mi memory, 300s timeout
   → Retry up to 3 times
4. Build frontend Docker image
   → Injects: VITE_API_URL at build time
5. Push frontend image to Artifact Registry
6. Deploy frontend to Cloud Run (live-commerce-web)
   → Serves on port 8080 via Nginx
   → 256Mi memory
   → Retry up to 3 times
```

---

## 5. Deployment Option B: Manual CLI Deployment

If Cloud Build is not configured, deploy manually:

### Backend

```bash
# 1. Build
cd backend
docker build -t asia-southeast1-docker.pkg.dev/dachin-live-commerce/cloud-run-source-deploy/live-commerce-api:latest .

# 2. Push
docker push asia-southeast1-docker.pkg.dev/dachin-live-commerce/cloud-run-source-deploy/live-commerce-api:latest

# 3. Deploy
gcloud run deploy live-commerce-api \
  --image=asia-southeast1-docker.pkg.dev/dachin-live-commerce/cloud-run-source-deploy/live-commerce-api:latest \
  --region=asia-southeast1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,CORS_ORIGIN=https://live-commerce-web-416645281925.asia-southeast1.run.app" \
  --set-secrets="JWT_SECRET=jwt-secret:latest" \
  --memory=512Mi \
  --timeout=300
```

### Frontend

```bash
# 1. Build (inject API URL)
cd frontend
docker build \
  --build-arg VITE_API_URL=https://live-commerce-api-416645281925.asia-southeast1.run.app/api \
  -t asia-southeast1-docker.pkg.dev/dachin-live-commerce/cloud-run-source-deploy/live-commerce-web:latest .

# 2. Push
docker push asia-southeast1-docker.pkg.dev/dachin-live-commerce/cloud-run-source-deploy/live-commerce-web:latest

# 3. Deploy
gcloud run deploy live-commerce-web \
  --image=asia-southeast1-docker.pkg.dev/dachin-live-commerce/cloud-run-source-deploy/live-commerce-web:latest \
  --region=asia-southeast1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=256Mi
```

---

## 6. Environment Variables Reference

### Backend (live-commerce-api)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Set to `production` for secure cookies |
| `JWT_SECRET` | Yes | — | Secret for JWT signing (via Secret Manager) |
| `CORS_ORIGIN` | Yes | — | Frontend URL. Must be exact match, no trailing slash |
| `PG_HOST` | No | — | If set, enables PostgreSQL mode |
| `PG_PORT` | No | `5432` | PostgreSQL port |
| `PG_DATABASE` | No | `live_commerce` | PostgreSQL database name |
| `PG_USER` | No | `lvbcsym` | PostgreSQL username |
| `PG_PASSWORD` | No | — | PostgreSQL password (use Secret Manager) |

**Current deployment values:**

```
NODE_ENV=production
CORS_ORIGIN=https://live-commerce-web-416645281925.asia-southeast1.run.app
JWT_SECRET=jwt-secret:latest (from Secret Manager)
# PG_HOST is NOT set → SQLite fallback mode
```

### Frontend (live-commerce-web)

| Variable | Required | When | Description |
|----------|----------|------|-------------|
| `VITE_API_URL` | Yes | Build time | Backend API base URL |

**Current value:**
```
VITE_API_URL=https://live-commerce-api-416645281925.asia-southeast1.run.app/api
```

---

## 7. Post-Deployment Verification

After deployment completes, verify the following:

### 7.1 Service Health

```bash
# Backend health check
curl -s https://live-commerce-api-416645281925.asia-southeast1.run.app/health
# Expected: 200 OK with JSON response

# Frontend loads
curl -s -o /dev/null -w "%{http_code}" https://live-commerce-web-416645281925.asia-southeast1.run.app
# Expected: 200
```

### 7.2 Functional Verification

Open the frontend URL in a browser:

| # | Test | Expected Result |
|---|------|----------------|
| 1 | Load login page | Login form renders without errors |
| 2 | Login with `admin@example.com` / `123456` | Redirects to dashboard |
| 3 | Check sidebar | "Workflow" menu item should be **GONE** |
| 4 | Check browser DevTools → Cookies | `token` cookie with `HttpOnly` flag visible |
| 5 | Check browser console: `document.cookie` | Should **NOT** contain `token` (XSS-safe) |
| 6 | Navigate to Tools page | Script generation UI loads |
| 7 | Check browser console | No CORS errors |

### 7.3 Database Mode Confirmation

Check the backend logs in Cloud Run:

```bash
gcloud run services logs read live-commerce-api --region=asia-southeast1 --limit=50
```

Look for one of these startup messages:
- `📂 SQLite: /app/data/local.db` → SQLite fallback mode ✅
- `📂 PostgreSQL: localhost:5432/live_commerce` → PostgreSQL mode

---

## 8. Troubleshooting

### Build fails: "better-sqlite3 compilation error"

The backend Dockerfile includes `python3 make g++` for native module compilation. If this still fails:

```dockerfile
# In backend/Dockerfile, ensure this line exists:
RUN apk add --no-cache python3 make g++
```

### CORS errors in browser console

Verify `CORS_ORIGIN` matches the **exact** frontend URL:

```bash
gcloud run services describe live-commerce-api --region=asia-southeast1 --format="value(status.url)"
# Compare with the CORS_ORIGIN env var
```

Common mistakes:
- Trailing slash: `https://example.com/` ← **wrong**, should be `https://example.com`
- HTTP vs HTTPS mismatch
- Wrong service URL

### "Cookie not being set" after login

1. Ensure `NODE_ENV=production` (enables `Secure` cookie flag)
2. Cloud Run provides HTTPS by default — this should work automatically
3. Check that `CORS_ORIGIN` is set correctly

### Container keeps restarting

Check logs:
```bash
gcloud run services logs read live-commerce-api --region=asia-southeast1 --limit=100
```

Common causes:
- Missing `JWT_SECRET` → backend crashes on startup
- Port mismatch → backend listens on 3000, frontend on 8080

### Revision conflict during deploy

The `cloudbuild.yaml` includes retry logic (3 attempts with 10s delay). If it still fails:

```bash
# Force deploy with --no-traffic first, then migrate
gcloud run deploy live-commerce-api \
  --image=<IMAGE> \
  --region=asia-southeast1 \
  --no-traffic

# Then shift traffic
gcloud run services update-traffic live-commerce-api \
  --to-latest \
  --region=asia-southeast1
```

---

## 9. Future: Migrating to Cloud SQL

When ready to upgrade from SQLite to persistent PostgreSQL:

### 1. Create Cloud SQL Instance

```bash
gcloud sql instances create live-commerce-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-southeast1

gcloud sql databases create live_commerce \
  --instance=live-commerce-db

gcloud sql users set-password postgres \
  --instance=live-commerce-db \
  --password=<STRONG_PASSWORD>
```

### 2. Add Secret

```bash
echo -n "<STRONG_PASSWORD>" | gcloud secrets create pg-password --data-file=-
```

### 3. Update Cloud Run Deploy Command

Add to the backend deploy step:

```bash
--add-cloudsql-instances=dachin-live-commerce:asia-southeast1:live-commerce-db
--set-env-vars=PG_HOST=/cloudsql/dachin-live-commerce:asia-southeast1:live-commerce-db,PG_PORT=5432,PG_USER=postgres,PG_DATABASE=live_commerce
--set-secrets=PG_PASSWORD=pg-password:latest
```

The backend will automatically detect `PG_HOST` and switch to PostgreSQL mode.

### 4. Cost Estimate

| Resource | Monthly Cost |
|----------|-------------|
| Cloud SQL `db-f1-micro` | ~$7–10 |
| Cloud SQL `db-g1-small` (production) | ~$25–35 |

---

## Quick Reference

| Item | Value |
|------|-------|
| GCP Project | `dachin-live-commerce` |
| Project Number | `416645281925` |
| Region | `asia-southeast1` |
| Backend Service | `live-commerce-api` |
| Frontend Service | `live-commerce-web` |
| Backend URL | `https://live-commerce-api-416645281925.asia-southeast1.run.app` |
| Frontend URL | `https://live-commerce-web-416645281925.asia-southeast1.run.app` |
| Secret (JWT) | `jwt-secret` |
| Database Mode | SQLite fallback (no Cloud SQL) |
| Backend Port | 3000 |
| Frontend Port | 8080 |
| Default Admin | `admin@example.com` / `123456` |

---

*For questions, contact the development team.*
