# Bus Tracker — Issues & Improvements

> Proposed changes to improve the bus tracker. Ordered roughly by impact, with the
> most user-visible and architecturally important items first.

---

## High Priority

### 1. Show all vehicles on map when no stop/departure is selected

**Problem:** Vehicle markers only appear on the map after clicking a departure (i.e.
when a route is "selected"). If you just open the app and pan around, you see nothing
but the base map. The original design showed live buses on the map and the nearby-stops
sidebar simultaneously.

**Suggestion:** Always fetch and render vehicle positions on the map. When no route
is selected, show all vehicles (bus + LRT) as colored route markers. When a route
_is_ selected, keep the current filtered view. This restores the "live bus map" feel
while keeping the stops-and-times sidebar.

**Files:** `MapView.tsx`, `useVehiclePositions.ts`

---

### 2. Split MapView.tsx into smaller components

**Problem:** `MapView.tsx` is 837 lines and handles everything: map setup, marker
rendering (stops, trip stops, vehicles, user location), the sidebar (nearby stops
list, departure groups, trip details), icon building, the LocateControl custom
Leaflet control, and data orchestration. This makes it hard to reason about, test,
or modify isolated pieces.

**Suggestion:** Extract:

- `Sidebar.tsx` / `StopsPanel.tsx` — the left sidebar with nearby stop list, departure
  cards, and trip detail view
- `StopMarker.tsx`, `TripStopMarker.tsx`, `VehicleMarker.tsx`, `UserMarker.tsx` —
  dedicated marker components (or use a factory pattern via `L.divIcon` builders
  that are already partially extracted)
- `LocateControl.tsx` — the custom Leaflet control, already mostly self-contained
  but lives in the same file
- `useDepartureGroups.ts` — the departure grouping/sorting logic that's currently
  inline as `useMemo` hooks
- `MapBindings.tsx` — already extracted as a child component, could live in its own file

**Files:** `MapView.tsx`

---

### 3. Return `routeShortName` and `routeColor` in the vehicles API

**Problem:** The `/api/vehicles` endpoint returns raw GTFS fields (`route_id`,
`vehicle_id`, `latitude`, etc.) but doesn't join with static route metadata
(`route_short_name`, `route_color`). The frontend has to look up route metadata
from the `/api/routes` response, and can't even do that reliably for vehicles
whose route didn't have a shape (since `useRoutes` only returns routes that
survived the shape-filter). This means vehicle markers can't show route colors
in the "all vehicles" view (issue #1).

**Suggestion:** Enrich vehicle objects in the cache with `route_short_name`,
`route_color`, and `route_text_color` from the static route index before
serving them.

**Files:** `backend/services/cache.py` (in `get_vehicles` or `refresh_once`)

---

### 4. Add loading skeletons and empty states

**Problem:** The sidebar shows bare text ("Loading departures…", "No nearby stops
found.") during loading states. This feels unpolished compared to modern map apps.

**Suggestion:** Replace text loaders with:
- Pulsing skeleton cards for nearby stops (3-4 placeholder cards with gray
  shimmer)
- A small spinner or skeleton for departure list loading
- A more informative empty state: "No stops found nearby — try panning the map"
  instead of just "No nearby stops found."

**Files:** `MapView.tsx` (sidebar section)

---

### 5. Debounce stop refresh on map pan

**Problem:** `useNearbyStops` fires on every `moveend` event, refetching stops
at the new center. Since `staleTime` and `refetchInterval` are both 10s, rapid
panning triggers many unnecessary API calls.

**Suggestion:** Either:
- Increase `staleTime` to 30-60s for the nearby-stops query (so panning within
  the stale window doesn't re-fetch), or
- Debounce the `onCenterChange` callback by ~1s in `MapBindings` so small pans
  don't trigger a new fetch.

**Files:** `MapView.tsx` (`MapBindings` and `moveend` handler), `useNearbyStops.ts`

---

### 6. Handle stale/unavailable GTFS feeds gracefully

**Problem:** If the GRT/LRT GTFS-realtime feeds are unreachable for a while, the
cache keeps its last-known data but eventually becomes stale. The frontend shows
no indicator that data might be old. Additionally, if a feed returns no vehicle
positions (e.g. overnight), the app shows an empty map with no explanation.

**Suggestion:**
- Add a `last_refresh_age_seconds` or `stale` field to the `/api/vehicles` response
  so the frontend can show a "Data may be stale — last updated X minutes ago" banner
- If a feed fetch fails, keep the old data but mark it as stale
- Show a calm, non-error message when there are active routes but zero vehicles
  (e.g. "No buses currently running on this route")

**Files:** `backend/services/cache.py`, `frontend/src/App.tsx` or `MapView.tsx`

---

### 7. Add route overview / route browser

**Problem:** There's no way to browse routes by number. You have to find a stop
near you first, then click a departure to see trip details. If you want to look
up a specific route (e.g. "What's the 7's schedule?"), there's no entry point.

**Suggestion:** Add a route browser toggle in the sidebar header:
- "Stops" tab (existing nearby-stop list) and "Routes" tab (searchable/filterable
  list of all routes from the `/api/routes` response)
- Clicking a route shows its vehicle positions on the map and/or its stops

**Files:** `MapView.tsx`, potentially a new `RouteListPanel.tsx`

---

## Medium Priority

### 8. Add keyboard shortcuts

**Problem:** The sidebar has no keyboard navigation support. Power users can't
press Escape to close a departure detail, or Tab through departure cards.

**Suggestion:**
- Escape key: deselect stop / go back from departure view
- Arrow keys: navigate through nearby stops list
- Enter: select the focused stop

**Files:** `MapView.tsx` (add global keydown listener)

---

### 9. Visually distinguish bus vs LRT markers

**Problem:** The `transportType` field exists (`bus` / `lrt`) but isn't surfaced
anywhere in the UI. Bus and LRT markers look identical, making it hard to tell
what kind of transit is serving a stop.

**Suggestion:**
- Add a subtle visual cue: an "LRT" badge on LRT stop markers, or use a different
  marker shape (slightly rounded square for LRT vs circular for bus)
- Include the transport type badge in departure cards
- Show an icon/badge on vehicle markers

**Files:** `MapView.tsx` (icon builders), `StopDeparture` display

---

### 10. Persist GTFS static data to disk / SQLite

**Problem:** Every process restart re-downloads and re-parses the entire GTFS
static zip (routes.txt, stops.txt, trips.txt, shapes.txt, stop_times.txt). This
takes several seconds, wastes bandwidth, and means the app serves no data until
static parsing completes.

**Suggestion:** Cache the parsed static data in a local SQLite database (or even
a simple JSON file). Check the GTFS zip's `Last-Modified` header and only
re-fetch when the static feed changes (typically daily at most).

**Files:** `backend/services/cache.py`, `backend/services/gtfs_static.py`

---

### 11. Compute both predicted and scheduled departures

**Problem:** The `get_stop_departures` endpoint only returns departures that have
a matching trip update (real-time prediction). If a trip has no active update
(e.g. GRT's GTFS-rt feed only covers ~30 min ahead), that trip doesn't appear
even though the static schedule knows about it.

**Suggestion:** For departures beyond the real-time prediction horizon, fall back
to static schedule times from `stop_times.txt`. Compute `predicted_time` from
static departure time + current date offset, mark them with
`minutes_away: "scheduled"` vs `"predicted"` so the frontend can style them
differently.

**Files:** `backend/services/cache.py` (`get_stop_departures`)

---

### 12. Add health endpoint metadata

**Problem:** `GET /health` returns just `{"status": "ok"}`. There's no way to
quickly diagnose cache health, last refresh time, or feed connectivity.

**Suggestion:** Enrich the health endpoint:
```json
{
  "status": "ok",
  "last_updated": "2026-06-14T12:00:00+00:00",
  "cache": {
    "vehicles": 42,
    "routes": 87,
    "stops": 2500,
    "trip_updates": 180
  },
  "feeds": {
    "grt_vehicle_positions": "ok",
    "lrt_vehicle_positions": "ok",
    "grt_trip_updates": "ok",
    "grt_static": "ok"
  }
}
```

**Files:** `backend/api/routes.py`, `backend/services/cache.py`

---

### 13. Remove or rework per-vehicle arrivals endpoint

**Problem:** `GET /api/vehicles/{vehicle_id}/arrivals` does a linear scan through
all trip updates to find the matching trip. The endpoint is also unused in the
current frontend (the stop-departure and trip-detail paths serve the same data
better). If it's not consumed, it's dead code that adds maintenance surface area.

**Suggestion:** Either remove it, or refactor it to use `get_trip_details` under
the hood (look up the vehicle's trip_id first, then return trip details).

**Files:** `backend/api/routes.py`

---

### 14. Set up CI linting and formatting checks

**Problem:** The project has `ruff` and `black` for Python, `eslint` and `prettier`
for the frontend, but no CI configuration runs them.

**Suggestion:** Add a GitHub Actions workflow (`.github/workflows/ci.yml`) that:
- Runs `ruff check .` on the backend
- Runs `black --check .` on the backend
- Runs `npm run lint` and `npm run format:check` on the frontend
- Runs backend tests via `pytest`

**Files:** New file `.github/workflows/ci.yml`

---

### 15. Create AGENTS.md with project conventions

**Problem:** No developer onboarding doc. A new contributor (or agent) has to
read the entire codebase to learn conventions around branch naming, commit style,
camelCase vs snake_case mapping patterns, etc.

**Suggestion:** Create `AGENTS.md` covering:
- Branch naming (feat/, fix/, refactor/…)
- Commit message convention
- How the frontend maps API snake_case → TypeScript camelCase
- How testing works (monkeypatch FakeCache for backend, no frontend tests yet)
- Dev setup commands

**Files:** New file `AGENTS.md`

---

## Low Priority / Polish

### 16. Remove hardcoded CORS origins

**Problem:** The backend hardcodes the old Vercel URL
(`https://bus-tracker-murex-psi.vercel.app`). This is dead configuration if the
deployment moved.

**Suggestion:** Read the full allowed-origins list from environment variables
(`CORS_ALLOWED_ORIGINS` as a comma-separated list) and only fall back to the
dev origins (`localhost:5173`, etc.).

**Files:** `backend/app/main.py`

---

### 17. Animate map transitions on stop selection

**Problem:** Clicking a stop in the sidebar doesn't smoothly pan/fly the map to
that stop. If the stop is far from the current viewport, the user has to find it
manually.

**Suggestion:** When a stop or departure is selected, call
`mapRef.current.flyTo([stop.lat, stop.lon], 14)` with a smooth animation
duration of ~1s.

**Files:** `MapView.tsx` (in the stop-click handler)

---

### 18. Add a "refresh now" button

**Problem:** If the GTFS feed is slow or stale, the user has no way to trigger
a manual cache refresh without reloading the page.

**Suggestion:** Add a small refresh icon button in the sidebar header that calls
a new `POST /api/refresh` endpoint (which just calls `cache.refresh_once()`) and
then invalidates all React Query caches.

**Files:** `backend/api/routes.py`, `MapView.tsx` (sidebar header)

---

### 19. Add an `.env.example` file at the repo root

**Problem:** The README says "see the root `.env.example` for a template" but no
such file exists.

**Suggestion:** Create `.env.example` with all the environment variables used by
both backend and frontend, plus inline comments explaining each.

**Files:** New file `.env.example`

---

### 20. Frontend tests

**Problem:** The backend has a solid test suite (pytest with FakeCache injection,
GTFS parsing tests, GTFS-realtime parsing tests). The frontend has zero tests.

**Suggestion:** Add at least:
- A smoke test that the app renders without crashing (Vitest + React Testing Library)
- A hook test for `useRoutes` or `useStopDepartures` using MSW or a mock
  QueryClient
- A snapshot or basic interaction test for the sidebar UI

**Files:** `frontend/src/__tests__/` (new directory)

---

### 21. Add TypeScript path aliases

**Problem:** Frontend imports use relative paths like
`"../../api/client"` / `"../api/types"` across multiple hooks. As the component
tree grows, relative imports become fragile during refactors.

**Suggestion:** Configure `vite.config.ts` and `tsconfig.json` with `@/` alias
pointing to `src/`, then import as `@/api/client`, `@/hooks/useRoutes`, etc.

**Files:** `frontend/vite.config.ts`, `frontend/tsconfig.json`

---

### 22. Document the data flow in a short architecture doc

**Problem:** The flow from "GRT GTFS-RT protobuf" → "parsed dict in cache" →
"FastAPI JSON response" → "React Query hook" → "component" is non-trivial but
undocumented. New contributors have to trace through 4+ layers to understand
how a bus position reaches the map.

**Suggestion:** Add `docs/architecture.md` with:
- A system diagram (or ASCII chart)
- Data flow for vehicles, departures, and trip details
- How caching works
- How the frontend API mapping layer works

**Files:** New file `docs/architecture.md`

---

### 23. Clean up unused `useVehicleArrivals` hook

**Problem:** `useVehicleArrivals` exists but is never imported by any component.
It calls `/api/vehicles/{vehicle_id}/arrivals` which duplicates data from the
stop-departure and trip-detail endpoints.

**Suggestion:** Either remove it, or add a comment noting it's available for
future use (e.g. a vehicle popup that shows upcoming stops).

**Files:** `frontend/src/hooks/useVehicleArrivals.ts`

---

### 24. Icon cache doesn't get evicted

**Problem:** `stopIconCache`, `tripStopIconCache`, and `vehicleIconCache` are
`useRef<Map<string, L.DivIcon>>` that only ever grow. Icons are keyed on
`stop.id` or `label`, never evicted. Over a long-running session with many stops
this is a minor memory leak.

**Suggestion:** Cap each cache at ~500 entries (LRU eviction) using a simple
LinkedHashMap pattern, or just use a `Map` and delete the oldest entry when
size exceeds a threshold.

**Files:** `MapView.tsx`

---

### 25. Support `gzip` / `deflate` GTFS feeds

**Problem:** Some GTFS feeds serve the zip with `Content-Encoding: gzip` (double-wrapped).
The current HTTPX call receives the raw bytes which may not be a valid zip.
This hasn't been an issue with GRT, but could be for other agencies.

**Suggestion:** If `zipfile.BadZipFile` is raised, try `gzip.decompress()` on
the response bytes before parsing.

**Files:** `backend/services/gtfs_static.py`

---

### 26. Add version / release information

**Problem:** No way to tell what version of the app is running. The `pyproject.toml`
version is `0.1.0` but it's not exposed anywhere.

**Suggestion:**
- Expose the backend version via `/health` or a new `/version` endpoint
- Expose the frontend version via `package.json`'s `version` field in a build-time
  constant (Vite's `import.meta.env.PACKAGE_VERSION`)
- Show the version in the sidebar footer

**Files:** `backend/api/routes.py`, `frontend/src/App.tsx`

---

### 27. Docker Compose: add healthchecks and depends_on conditions

**Problem:** The `frontend` service has `depends_on: - backend` but without
`condition: service_healthy`. If the backend starts slowly (parsing GTFS static),
the Nginx reverse proxy will 502 until the backend is actually ready.

**Suggestion:** Add a Docker healthcheck to the backend service and set
`condition: service_healthy` on the frontend's `depends_on`.

**Files:** `docker-compose.yml`

---

### 28. Plot vehicle heading arrows

**Problem:** The `bearing` field is computed (via fallback bearings from previous
positions) but never visualized on the map. Vehicle markers are circular "B"
badges with no direction indicator.

**Suggestion:** Rotate the vehicle marker icon based on the `heading` value using
`transform: rotate(Ndeg)`, or add a small direction arrow (like a triangular
marker tip). This makes it much easier to see which way a bus is traveling.

**Files:** `MapView.tsx` (BusMarker / getVehicleIcon)

---

### 29. Add trip progress indicator

**Problem:** When viewing trip details, the stop list shows all upcoming stops but
there's no indication of where the vehicle *currently* is along the route. The
trip-stop markers show "X min" but it's hard to tell at a glance whether you've
already missed some stops.

**Suggestion:** On the polyline, add a vehicle position marker (from the vehicle
positions feed for that trip/route). Show visited stops with a different color
or a checkmark. This makes the trip detail view feel alive.

**Files:** `MapView.tsx`, potentially `useTripDetails` or a new
`useTripProgress` hook

---

### 30. Refactor the cache layer to separate concerns

**Problem:** `Cache` in `services/cache.py` is ~487 lines and handles:
1. GTFS data storage (vehicles, routes, stops, trips, trip_updates)
2. Background refresh scheduling
3. Query logic (nearby stops filtering, haversine distance, departure grouping)
4. Bearing computation from previous positions

This is the largest backend file and mixes infrastructure (task management) with
domain logic (filtering, computation).

**Suggestion:** Split into:
- `Cache` → just the storage + background refresh loop
- `GeoQuery` (or keep in `cache.py`) → haversine, nearby-stops filtering
- `DepartureQuery` → departure computation from updates + static data

**Files:** `backend/services/cache.py`

---

### 31. Add OpenAPI tags and descriptions

**Problem:** FastAPI auto-generates OpenAPI docs at `/docs`, but the routes have
no tags, summary strings, or response models. The auto-generated docs are
functional but unhelpful.

**Suggestion:** Add FastAPI `tags`, `summary`, and Pydantic `response_model`s to
each endpoint.

**Files:** `backend/api/routes.py`
