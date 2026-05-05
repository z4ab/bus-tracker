# Bus Tracker Backend

FastAPI service that exposes GTFS-powered endpoints for vehicle locations and route metadata.

## Requirements

- Python 3.10+
- `pip`

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`

## Environment variables

Required:
- `GRT_VEHICLE_POSITIONS_URL` — GTFS-realtime vehicle positions feed URL.
- `GRT_GTFS_STATIC_URL` — GTFS static zip URL.

Optional:
- `GRT_TRIP_UPDATES_URL` — trip updates feed URL (required for arrival predictions).
- `GRT_ALERTS_URL` — alerts feed URL (not used yet).
- `REFRESH_SECONDS` — refresh interval in seconds (default: 30).
- `GRT_ALLOW_WEAK_TLS` — set to true to allow weak DH parameters for GTFS fetches (use only if required by the feed).

See the root `.env.example` for a shared template.

## Run the API

- `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

CORS is enabled for the local Vite dev server (`http://localhost:5173`). If you need a different origin, update `app/main.py`.

## Endpoints

- `GET /health`
- `GET /api/vehicles`
- `GET /api/vehicles/{vehicle_id}`
- `GET /api/vehicles/{vehicle_id}/arrivals`
- `GET /api/routes`

## Linting & formatting

- `ruff check .`
- `black .`

## Tests

- `pytest`
