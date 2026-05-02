# Bus Tracker

Real-time bus tracking for the Region of Waterloo GRT feeds. This repo includes a FastAPI backend that normalizes GTFS data and a React + Vite frontend that renders live vehicle positions on a map.

## Highlights

- **FastAPI backend** pulls GTFS‑realtime vehicle positions, caches them in memory, and serves a JSON API.
- **Static GTFS parsing** provides route metadata (names, colors) and optional shapes for polylines.
- **React frontend** with Leaflet map markers, MUI UI, and React Query polling.
- **Route panel** shows vehicle counts by route and a quick overview.

## Tech stack

- **Backend:** FastAPI, HTTPX, GTFS‑realtime protobuf bindings
- **Frontend:** React + Vite + TypeScript, Leaflet + React‑Leaflet, MUI, React Query, Tailwind

## Repository layout

```
.
├─ backend/   # FastAPI service + GTFS parsing
├─ frontend/  # React app (Vite + TypeScript)
└─ README.md
```

## Quick start

### 1) Backend

From `backend/`:

1. Create and activate a virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Create `backend/.env` (see the root `.env.example` for a template).
4. Run the API:
   - `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file .env`

### 2) Frontend

From `frontend/`:

1. Install dependencies:
   - `npm install`
2. Create `frontend/.env` (see the root `.env.example` for a template).
3. Run the dev server:
   - `npm run dev`

## Environment variables (backend)

Required:

- `GRT_VEHICLE_POSITIONS_URL` — GTFS‑realtime vehicle positions feed URL.
- `GRT_GTFS_STATIC_URL` — GTFS static zip URL.

Optional:

- `GRT_TRIP_UPDATES_URL` — trip updates feed URL (not used yet).
- `GRT_ALERTS_URL` — alerts feed URL (not used yet).
- `REFRESH_SECONDS` — refresh interval in seconds (default: 30).
- `GRT_ALLOW_WEAK_TLS` — allow weak TLS parameters for feeds (use only if required).

## API endpoints

- `GET /health`
- `GET /api/vehicles`
- `GET /api/vehicles/{vehicle_id}`
- `GET /api/routes`

## Frontend behavior

- Polls `/api/vehicles` every 10 seconds and `/api/routes` every 60 seconds.
- Renders vehicles as colored route markers on an OpenStreetMap tile layer.
- Clicking a marker highlights the selected route and draws its GTFS shape (when available).
