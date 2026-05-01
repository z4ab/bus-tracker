# GRT Bus Tracker (React + Vite + TypeScript + Tailwind + MUI + FastAPI)

This guide explains how to build a map that tracks GRT bus positions using the Region of Waterloo real‑time feeds. The front end uses React + Vite + TypeScript + Tailwind CSS + Material UI (MUI). The back end uses FastAPI to fetch and normalize GTFS‑realtime data.

---

## 1. High‑level architecture

- **Data source:** GRT GTFS‑realtime feeds (Vehicle Positions, Trip Updates, Alerts) and static GTFS (routes, trips, shapes).
- **Back end (FastAPI):**
  - Periodically downloads the GTFS‑realtime protobuf feed(s).
  - Parses feed messages into JSON.
  - Exposes a clean, CORS‑friendly REST API for the front end.
- **Front end (React):**
  - Polls your FastAPI endpoint for the latest vehicle positions.
  - Renders buses on a map with live updates.
  - Uses MUI components for UI, Tailwind for layout and theming utilities.

---

## 2. Data sources (GRT)

Open the official feed page and copy the direct feed URLs for:

- **Vehicle Positions** (protobuf file, typically `VehiclePositions.pb`)
- **Trip Updates** (protobuf file, typically `TripUpdates.pb`)
- **Alerts** (protobuf file, typically `Alerts.pb`)
- **Static GTFS** (zip, typically `GTFS.zip`)

Feed page:
- https://webapps.regionofwaterloo.ca/api/grt-routes/

> You’ll use **Vehicle Positions** for real‑time bus locations. **Static GTFS** is used to map route IDs to names, colors, and shapes.

---

## 3. Back end (FastAPI)

### 3.1. Dependencies

Install typical packages:
- `fastapi`
- `uvicorn`
- `httpx` (HTTP client)
- `gtfs-realtime-bindings` (protobuf parser for GTFS‑realtime)
- `python-dotenv` (environment variables)
- `cachetools` (optional caching)

### 3.2. Environment configuration

Store feed URLs in environment variables (don’t hardcode URLs):

- `GRT_VEHICLE_POSITIONS_URL`
- `GRT_TRIP_UPDATES_URL` (optional)
- `GRT_ALERTS_URL` (optional)
- `GRT_GTFS_STATIC_URL`
- `REFRESH_SECONDS` (e.g., `10` to `20`)

### 3.3. Parsing GTFS‑realtime

Use the GTFS‑realtime protobuf bindings to parse data into JSON objects.
You’ll typically extract:

- `vehicle_id`
- `trip_id`
- `route_id`
- `latitude`
- `longitude`
- `bearing`
- `speed`
- `timestamp`

### 3.4. API endpoints (example)

Design a clean API for the front end:

- `GET /api/vehicles` → list of current vehicles
- `GET /api/vehicles/{id}` → details for a single vehicle
- `GET /api/routes` → list of routes (from static GTFS)
- `GET /health` → health check

### 3.5. Caching and refresh

- Refresh the feed on a timer (e.g., every 10–20 seconds).
- Store parsed results in memory so the front end can respond quickly.
- Add basic rate limiting and error logging.

---

## 4. Front end (React + Vite + TypeScript)

### 4.1. Libraries

Recommended packages:

- **Mapping:** `leaflet` + `react-leaflet`
- **UI:** `@mui/material`, `@emotion/react`, `@emotion/styled`
- **Data fetching:** `@tanstack/react-query` or `swr`
- **Styling:** `tailwindcss`, `postcss`, `autoprefixer`

### 4.2. React data model

Define TypeScript interfaces to match your API:

- `VehiclePosition`
- `Route`

Include fields such as `routeId`, `lat`, `lon`, `bearing`, `updatedAt`.

### 4.3. Map UI

- Use an OpenStreetMap tile layer via Leaflet.
- Render each bus as a marker.
- Use route colors and route short names for marker styling.
- Re-fetch data on an interval (e.g., every 10–15 seconds).

### 4.4. Layout

- MUI for components like app bar, drawers, filters, and lists.
- Tailwind for layout, spacing, and responsive grids.

---

## 5. Development workflow

1. **Run FastAPI**
   - Start the API server locally.
   - Ensure CORS is enabled for the Vite dev server origin.

2. **Run the Vite app**
   - Configure the API base URL in a `.env` file (e.g., `VITE_API_BASE_URL`).
   - Verify buses appear on the map and update periodically.

---

## 6. Next steps (nice‑to‑have)

- **Route filtering** and search.
- **Real‑time arrival predictions** from Trip Updates.
- **Alerts banner** from Alerts feed.
- **Bus detail panel** with trip progress and direction.
- **Polyline shapes** from static GTFS for route visualization.

---

If you want, tell me your preferred file layout and I can create the starter FastAPI and Vite code scaffolding next.