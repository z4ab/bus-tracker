# Project Skeleton (from README)

This document captures the intended project structure and the main responsibilities of each part, based on the current `README.md`.

---

## Architecture overview

- **Data sources:** GRT GTFS‑realtime feeds (Vehicle Positions, Trip Updates, Alerts) and static GTFS.
- **Back end (FastAPI):** Fetches and normalizes GTFS data into a CORS‑friendly REST API.
- **Front end (React + Vite):** Polls the API, renders buses on a map, and provides UI via MUI + Tailwind.

---

## Suggested repository layout

```
/ (repo root)
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI app + startup/shutdown
│  │  ├─ api/
│  │  │  ├─ routes.py          # API router (vehicles, routes, health)
│  │  ├─ services/
│  │  │  ├─ gtfs_realtime.py   # Fetch + parse GTFS‑realtime
│  │  │  ├─ gtfs_static.py     # Static GTFS parsing (routes, shapes)
│  │  │  ├─ cache.py           # In‑memory cache + refresh scheduler
│  │  ├─ schemas/
│  │  │  ├─ vehicle.py         # Pydantic models for API responses
│  │  │  ├─ route.py
│  │  ├─ core/
│  │  │  ├─ config.py          # Env vars + settings
│  │  │  ├─ logging.py         # Logging config
│  │  ├─ __init__.py
│  ├─ tests/
│  ├─ requirements.txt         # Or pyproject.toml
│  └─ README.md                # Backend-specific notes
├─ frontend/
│  ├─ src/
│  │  ├─ api/
│  │  │  ├─ client.ts          # API base URL + fetch helpers
│  │  ├─ components/
│  │  │  ├─ MapView.tsx         # Leaflet map + markers
│  │  │  ├─ VehicleMarker.tsx
│  │  │  ├─ RouteFilter.tsx
│  │  ├─ hooks/
│  │  │  ├─ useVehicles.ts      # React Query/SWR data hook
│  │  ├─ types/
│  │  │  ├─ Vehicle.ts
│  │  │  ├─ Route.ts
│  │  ├─ App.tsx
│  │  ├─ main.tsx
│  ├─ public/
│  ├─ index.html
│  ├─ tailwind.config.js
│  ├─ postcss.config.js
│  ├─ vite.config.ts
│  └─ tsconfig.json
├─ .env.example                 # Env vars for both apps
├─ README.md
└─ docs/
   ├─ api.md                    # API contracts
   └─ data.md                   # Feed URLs + data notes
```

---

## TODOs for future agents

### Back end (FastAPI)

- [ ] Scaffold `backend/` with FastAPI entrypoint (`app/main.py`).
- [ ] Implement `core/config.py` with env vars:
  - `GRT_VEHICLE_POSITIONS_URL`
  - `GRT_TRIP_UPDATES_URL` (optional)
  - `GRT_ALERTS_URL` (optional)
  - `GRT_GTFS_STATIC_URL`
  - `REFRESH_SECONDS`
- [ ] Add CORS middleware for the Vite dev server origin.
- [ ] Implement GTFS‑realtime fetch + parse in `services/gtfs_realtime.py`.
  - Extract `vehicle_id`, `trip_id`, `route_id`, `latitude`, `longitude`, `bearing`, `speed`, `timestamp`.
- [ ] Implement static GTFS parsing in `services/gtfs_static.py`.
  - Map `route_id` to `route_short_name`, `route_color`, and shapes if needed.
- [ ] Add in‑memory cache with refresh timer in `services/cache.py`.
- [ ] Build API endpoints in `api/routes.py`:
  - `GET /api/vehicles`
  - `GET /api/vehicles/{id}`
  - `GET /api/routes`
  - `GET /health`
- [ ] Add logging + error handling with clear diagnostics.
- [ ] Add tests for parsing and API responses.

### Front end (React + Vite + TypeScript)

- [ ] Scaffold `frontend/` with Vite + React + TypeScript.
- [ ] Set up Tailwind + MUI + Emotion (`@emotion/react`, `@emotion/styled`).
- [ ] Add Leaflet + React‑Leaflet map with OSM tiles.
- [ ] Implement `api/client.ts` with base URL from `VITE_API_BASE_URL`.
- [ ] Define TypeScript types: `VehiclePosition`, `Route`.
- [ ] Add data fetching using React Query or SWR with interval refresh.
- [ ] Implement map markers using route colors and short names.
- [ ] Add UI layout with MUI app bar + optional side panel.

### Shared / Dev workflow

- [ ] Create `.env.example` with backend + frontend variables.
- [ ] Add scripts/notes for running FastAPI and Vite together.
- [ ] Add linting + formatting (e.g., `ruff`/`black` for Python, `eslint`/`prettier` for TS).

### Nice‑to‑have features (from README)

- [ ] Route filtering and search.
- [ ] Real‑time arrival predictions (Trip Updates feed).
- [ ] Alerts banner (Alerts feed).
- [ ] Bus detail panel with trip progress/direction.
- [ ] Route polylines from static GTFS shapes.
