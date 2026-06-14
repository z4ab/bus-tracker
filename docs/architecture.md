# Architecture

This document describes the end-to-end data flow of the Bus Tracker application,
from GTFS feed ingestion through to the React UI. It is intended for new
contributors who want to understand how data moves through the system.

## System Overview

The Bus Tracker follows a simple two-tier architecture:

```
┌──────────────────────────────────────────────────────────────────┐
│                        External GTFS Feeds                       │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐ │
│  │ GTFS-RT Vehicle  │  │  GTFS-RT Trip   │  │  GTFS Static Zip │ │
│  │   Positions      │  │    Updates      │  │ (routes, stops,  │ │
│  │ (Protobuf)       │  │  (Protobuf)     │  │  shapes)         │ │
│  └────────┬─────────┘  └────────┬────────┘  └────────┬─────────┘ │
│           │                     │                     │           │
└───────────┼─────────────────────┼─────────────────────┼───────────┘
            │                     │                     │
            │ HTTP GET            │ HTTP GET            │ HTTP GET
            ▼                     ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend                               │
│                                                                      │
│  ┌─────────────────┐    ┌────────────────────────────────────────┐   │
│  │   app/main.py   │    │          services/cache.py             │   │
│  │   (entrypoint)  │    │          (Cache class)                 │   │
│  │                 │    │                                        │   │
│  │  • CORS setup   │───▶│  • _run() — background loop           │   │
│  │  • startup():   │    │  • refresh_once() — fetch & parse     │   │
│  │    cache.start()│    │  • _vehicles, _routes, _stops,        │   │
│  │  • shutdown():  │    │    _trip_updates (in-memory)          │   │
│  │    cache.stop() │    │  • _apply_fallback_bearings()         │   │
│  └─────────────────┘    │  • get_* methods — async snapshots    │   │
│                          └───────────┬────────────────────────────┘   │
│                                      │                               │
│  ┌──────────────────┐   ┌───────────▼──────────────┐                │
│  │  api/routes.py   │   │ services/gtfs_realtime.py │                │
│  │  (FastAPI router)│   │                          │                │
│  │                  │   │  • fetch_vehicle_positions│                │
│  │  GET /health     │   │  • fetch_trip_updates    │                │
│  │  GET /api/vehicles│   │  • parse_vehicle_positions               │
│  │  GET /api/vehicles/│  │  • parse_trip_updates    │                │
│  │    :id            │   └──────────────────────────┘                │
│  │  GET /api/routes  │                                              │
│  │  GET /api/stops/  │   ┌──────────────────────────┐                │
│  │    nearby         │   │ services/gtfs_static.py   │                │
│  │  GET /api/vehicles│   │                          │                │
│  │    :id/arrivals   │   │  • fetch_static_bundle    │                │
│  └────────┬──────────┘   │  • fetch_static_bundle_   │                │
│           │              │    cached — HEAD+SQLite   │                │
│           │              │  • parse_gtfs_static_bundle               │
│           │              └───────────┬──────────────┘                │
│           │                          │                               │
│           │              ┌───────────▼──────────────┐                │
│           │              │ services/gtfs_db.py       │                │
│           │              │ (SQLite cache for static) │                │
│           │              └──────────────────────────┘                │
│           │                                                        │
│           │              ┌──────────────────────────┐                │
│           │              │ services/http_client.py   │                │
│           │              │ (shared HTTPX client)     │                │
│           │              └──────────────────────────┘                │
│           │                                                        │
│           │  ┌──────────────────────────────┐                       │
│           │  │     core/config.py           │                       │
│           │  │   Settings (dataclass)        │                       │
│           │  │   load_settings() — cached    │                       │
│           │  └──────────────────────────────┘                       │
└───────────┼──────────────────────────────────────────────────────────┘
            │ JSON responses (snake_case)
            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       React Frontend                                 │
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────────────────┐          │
│  │  api/client.ts   │     │   api/types.ts               │          │
│  │  apiGet<T>(path) │────▶│   TypeScript interfaces      │          │
│  │  (fetch wrapper) │     │   (camelCase)                │          │
│  └────────┬─────────┘     └──────────────────────────────┘          │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                   Hooks (@tanstack/react-query)                  ││
│  │                                                                  ││
│  │  ┌─────────────────────┐  ┌───────────────────┐                 ││
│  │  │useVehiclePositions  │  │   useRoutes       │                 ││
│  │  │  • GET /api/vehicles │  │   • GET /api/routes                ││
│  │  │  • toVehiclePosition│  │   • toRoute        │                 ││
│  │  │  • 10s poll         │  │   • 60s poll       │                 ││
│  │  └──────────┬──────────┘  └────────┬──────────┘                 ││
│  │             │                       │                            ││
│  │  ┌─────────────────────┐  ┌───────────────────┐                 ││
│  │  │useVehicleArrivals   │  │  useNearbyStops   │                 ││
│  │  │  • GET /api/vehicles │  │  • GET /api/stops/                 ││
│  │  │    /{id}/arrivals   │  │    nearby?lat=...  │                 ││
│  │  │  • toArrivals       │  │  • toStop          │                 ││
│  │  │  • 10s poll,        │  │  • 60s staleTime,  │                 ││
│  │  │    enabled when     │  │    10s poll        │                 ││
│  │  │    vehicle selected │  └─────────────────────┘                 ││
│  │  └─────────────────────┘                                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                   Components                                     ││
│  │                                                                  ││
│  │  ┌───────────────────────────────────────────────────────────┐  ││
│  │  │  App.tsx                                                 │  ││
│  │  │  • Orchestrates useVehiclePositions + useRoutes           │  ││
│  │  │  • Passes positions & routes down to MapView              │  ││
│  │  │  • Shows loading spinner, error banners, stale warnings   │  ││
│  │  └─────────────────────────┬─────────────────────────────────┘  ││
│  │                            │                                     ││
│  │  ┌─────────────────────────▼─────────────────────────────────┐  ││
│  │  │  MapView.tsx / MapBindings.tsx                            │  ││
│  │  │  • Leaflet map with react-leaflet                         │  ││
│  │  │  • VehicleMarker per position                             │  ││
│  │  │  • Route polyline (selected route's shape)                │  ││
│  │  │  • TripStopMarker for upcoming arrivals                   │  ││
│  │  │  • NearbyStopsPanel when data available                   │  ││
│  │  │  • useVehicleArrivals on vehicle select                   │  ││
│  │  │  • useNearbyStops on map center change                    │  ││
│  │  └──────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

## Data Flows

### 1. Vehicle Positions

This is the primary data flow — it powers the live bus markers on the map.

```
GRT GTFS-RT feed (protobuf)
    │
    ▼
services/gtfs_realtime.py::fetch_vehicle_positions()
    │  • HTTP GET the protobuf feed URL (configured in Settings)
    │  • Parse via gtfs_realtime_pb2.FeedMessage
    │  • Extract: vehicle_id, trip_id, route_id, lat, lng, bearing, speed, timestamp
    │  • Returns List[Dict[str, Any]] with snake_case keys
    ▼
services/cache.py::Cache.refresh_once()
    │  • Merge GRT + LRT vehicles into one list
    │  • Tag each with transport_type ("bus" or "lrt")
    │  • Run _apply_fallback_bearings() — fills missing bearings from
    │    previous refresh positions (dead-reckoning between two points)
    │  • Store in self._vehicles under asyncio.Lock
    ▼
    (in-memory cache updated every REFRESH_SECONDS = 30s by default)
    │
    ▼
api/routes.py::list_vehicles()
    │  • cache.get_vehicles() → returns snapshot of _vehicles list
    │  • Includes cache_status metadata (last_updated, stale flag, age)
    │  • Returns {"vehicles": [...], "last_updated": ..., ...}
    ▼
    JSON response (snake_case) via FastAPI
    │
    ▼
frontend/src/hooks/useVehiclePositions.ts
    │  • useQuery with key ["vehicle-positions"]
    │  • apiGet<VehiclePositionsResponse>("/api/vehicles")
    │  • Maps each raw dict through toVehiclePosition():
    │      vehicle_id  → id
    │      latitude    → lat
    │      longitude   → lon
    │      route_id    → routeId
    │      bearing     → heading
    │      timestamp   → updatedAt (converted epoch → ISO string)
    │      transport_type → transportType ("bus" | "lrt")
    │  • Polls every 10_000 ms (staleTime = refetchInterval = 10s)
    ▼
    VehiclePosition[] (camelCase)
    │
    ▼
frontend/src/components/MapView.tsx
    │  • Renders <VehicleMarker> for each valid position (lat/lon finite)
    │  • On marker click: sets selectedVehicleId, fetches arrivals
    │  • UserMarker for geolocated user position
    ▼
    BusTracker map with live markers
```

### 2. Trip Arrivals (Departures)

When the user clicks a vehicle marker, the app fetches upcoming stop times.

```
Marker click → selectedVehicleId set in MapView state
    │
    ▼
useVehicleArrivals(vehicleId) — enabled when vehicleId is non-null
    │
    ▼
GET /api/vehicles/{vehicle_id}/arrivals
    │
    ▼
api/routes.py::get_vehicle_arrivals()
    │  • cache.get_vehicle(vehicle_id) — lookup single vehicle
    │  • Extract trip_id from vehicle dict
    │  • cache.get_trip_details(trip_id):
    │      • Find matching trip update in _trip_updates list
    │      • Enrich each stop_time_update entry with:
    │          stop_name  (from _stops index)
    │          stop_lat   (from _stops index)
    │          stop_lon   (from _stops index)
    │      • Returns dict with trip_id, route_id, timestamp, stop_time_updates[]
    │  • Returns {"vehicle_id", "trip_id", "route_id", "feed_timestamp",
    │    "updated_at", "stops": [...]}
    │
    ▼
useVehicleArrivals.ts
    │  • Maps raw -> toArrivals():
    │      vehicle_id   → vehicleId
    │      trip_id      → tripId
    │      route_id     → routeId
    │      feed_timestamp → feedTimestamp
    │      updated_at   → updatedAt
    │      stops[]      → each stop via toStop():
    │          stop_id     → stopId
    │          stop_name   → stopName
    │          stop_lat    → stopLat
    │          stop_lon    → stopLon
    │          stop_sequence → stopSequence
    │          arrival_time  → arrivalTime
    │          arrival_delay → arrivalDelay
    │          departure_time → departureTime
    │          departure_delay → departureDelay
    │  • Polls every 10s while the vehicle is selected
    ▼
MapView.tsx
    │  • Computes upcomingStops: filters to future stops, sorts by time,
    │    takes top 5
    │  • Renders <TripStopMarker> for stops with valid coordinates
    │  • Also renders route polyline (from selectedRoute.shape)
```

### 3. Route List

Routes are fetched on app load and polled less frequently (60s) since they
change rarely.

```
services/gtfs_static.py::fetch_static_bundle_cached()
    │  • HEAD request → Last-Modified / ETag check
    │  • If unchanged: return cached data from SQLite (gtfs_db.py)
    │  • If changed or cache miss: HTTP GET the GTFS static zip
    │  • Parse routes.txt, stops.txt, trips.txt, shapes.txt
    │  • Persist to SQLite via save_cached_static()
    │  • Returns {"routes": {...}, "stops": {...}}
    ▼
Cache.refresh_once()
    │  • Fetched once on first refresh, then only when _routes is empty
    │  (static data does not re-fetch on every cycle)
    ▼
api/routes.py::list_routes()
    │  • cache.get_routes() → dict.values() as list
    ▼
useRoutes.ts
    │  • Maps raw -> toRoute():
    │      route_id          → id
    │      route_short_name  → shortName
    │      route_long_name   → longName
    │      route_color       → color
    │      route_text_color  → textColor
    │      shape[]           → shape (filtered, sorted, mapped)
    │  • Polls every 60s
    ▼
App.tsx → MapView.tsx
    │  • buildRouteIndex() → Map<string, Route> for O(1) lookup
    │  • Used for marker colors and route shape polylines
```

### 4. Nearby Stops

When the map is panned, nearby stops are fetched for the new center.

```
Map pan → moveend event (debounced 1s)
    │
    ▼
MapBindings.tsx → onCenterChange(lat, lon)
    │
    ▼
useNearbyStops([lat, lon], radius=500)
    │  • key: ["nearby-stops", lat, lon, radius]
    │  • GET /api/stops/nearby?lat=...&lon=...&radius=500
    │  • Uses keepPreviousData to avoid flicker during refetch
    │  • 60s staleTime, 10s polling
    ▼
api/routes.py::nearby_stops()
    │  • cache.get_nearby_stops(lat, lon, radius, limit)
    │  • Haversine distance calculation against all stops in _stops
    │  • Returns stops sorted by distance, limited to `limit` (default 20)
    ▼
useNearbyStops.ts
    │  • Maps raw -> toStop():
    │      stop_id           → stopId
    │      stop_name         → stopName
    │      stop_lat          → stopLat
    │      stop_lon          → stopLon
    │      distance_m        → distanceM
    │      zone_id           → zoneId
    │      wheelchair_boarding → wheelchairBoarding
    ▼
MapView.tsx → NearbyStopsPanel
```

## Caching Architecture

The system uses two cache layers with different lifetimes:

### Layer 1: In-Memory Cache (`services/cache.py`)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cache (singleton)                             │
│                                                                  │
│  Fields (all protected by asyncio.Lock):                         │
│                                                                  │
│  _vehicles: List[Dict]        ── vehicle positions              │
│  _routes: Dict[str, Dict]     ── route metadata (static)        │
│  _stops: Dict[str, Dict]      ── stop metadata (static)         │
│  _trip_updates: List[Dict]    ── trip update data               │
│                                                                  │
│  Metadata:                                                      │
│  _last_updated: ISO 8601 timestamp of last refresh              │
│  _last_updated_at: datetime for age calculations                │
│  _refresh_failed / _refresh_error: error tracking               │
│  _feed_health: per-feed status ("ok" / "error")                │
│  _previous_positions: for fallback bearing computation          │
│                                                                  │
│  Locking:                                                       │
│  _lock — guards all data fields (async context manager)         │
│  _refresh_lock — double-checked locking for ensure_fresh()      │
└─────────────────────────────────────────────────────────────────┘
```

**Refresh lifecycle:**

1. **`start()`** — called in `app.on_event("startup")`. Creates an
   `asyncio.Task` that runs `_run()` in the background.
2. **`_run()`** — infinite loop calling `refresh_once()`, then sleeping
   for `REFRESH_SECONDS` (default 30).
3. **`refresh_once()`** — fetches all configured feeds (GRT bus + optional
   LRT), parses them, applies fallback bearings, and atomically swaps data
   under `_lock`.
4. **`ensure_fresh()`** — on-demand refresh check called by every
   `get_*()` method. If the cache is stale or empty, triggers a single
   `refresh_once()` under a double-checked lock.
5. **`stop()`** — cancels the background task on shutdown.

**Key design points:**

- **Atomic swap:** `get_*()` methods return `list(self._vehicles)` or
  `dict(self._routes)` — shallow copies taken under `_lock`, so callers
  see a consistent snapshot even while a refresh is in progress.
- **Fallback bearings:** Missing bearing values are computed from the
  previous refresh's position using the Haversine formula. Previous
  positions are stored in `_previous_positions` and updated each cycle.
- **Error tolerance:** A failure in one feed (e.g., GRT vehicle positions)
  does not prevent other feeds from updating. `_refresh_failed` is set so
  the stale warning can be shown in the UI.

### Layer 2: SQLite Static Data Cache (`services/gtfs_db.py`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ~/.cache/bus-tracker/gtfs_static_cache.db                      │
│                                                                  │
│  Table: static_cache                                             │
│  ┌────────────┬──────────────┬──────┬────────┬──────┬──────────┐│
│  │ feed_url   │ last_modified│ etag │ routes │ stops│ cached_at││
│  ├────────────┼──────────────┼──────┼────────┼──────┼──────────┤│
│  │ grt_...zip │ Tue, ...     │ "x"  │ {json} │{json}│ 1700000 ││
│  │ lrt_...zip │ Mon, ...     │ "y"  │ {json} │{json}│ 1700001 ││
│  └────────────┴──────────────┴──────┴────────┴──────┴──────────┘│
└─────────────────────────────────────────────────────────────────┘
```

- **Purpose:** Avoid re-downloading the GTFS static zip (~10–50 MB) on
  every container restart. Routes and stops rarely change.
- **Mechanism:** Uses HTTP `HEAD` to check `Last-Modified` / `ETag`.
  If the server headers match the cached values, the SQLite copy is
  returned without any download.
- **Persistence:** Data is stored as JSON blobs columns. The optional
  `GTFS_CACHE_DIR` env var controls the cache directory location.
- **Best-effort writes:** Cache write failures are logged but do not
  prevent the app from serving the freshly fetched data.

## Frontend API Mapping Layer

The backend returns JSON with `snake_case` keys (Python convention). The
frontend uses `camelCase` (TypeScript convention). Every data-fetching
hook defines a two-type pattern and a mapper function.

### Pattern

Each hook file follows the same structure:

```typescript
// 1. Raw API type (snake_case — mirrors the Python dict keys exactly)
type SomeApi = {
  field_one?: string | null;
  field_two?: number | null;
};

// 2. Response wrapper (for endpoints that wrap data in an envelope)
type SomeResponse = {
  items: SomeApi[];
  meta_field?: string | null;
};

// 3. Mapper function
const toSomeType = (raw: SomeApi): SomeType => ({
  fieldOne: raw.field_one ?? undefined,
  fieldTwo: raw.field_two ?? undefined,
});

// 4. Fetch + map
const fetchData = async () => {
  const response = await apiGet<SomeResponse>("/api/some-endpoint");
  return response.items.map(toSomeType);
};

// 5. React Query hook
export const useSomeData = () =>
  useQuery({
    queryKey: ["some-data"],
    queryFn: fetchData,
    staleTime: 10000,
    refetchInterval: 10000,
  });
```

### Mapping Conventions

| snake_case (API response) | camelCase (TypeScript interface) |
|---------------------------|-----------------------------------|
| `vehicle_id`              | `id` (shortened)                  |
| `route_id`                | `routeId`                         |
| `route_short_name`        | `shortName`                       |
| `route_long_name`         | `longName`                        |
| `route_color`             | `color`                           |
| `route_text_color`        | `textColor`                       |
| `stop_id`                 | `stopId`                          |
| `stop_name`               | `stopName`                        |
| `stop_lat`                | `stopLat`                         |
| `stop_lon`                | `stopLon`                         |
| `stop_sequence`           | `stopSequence`                    |
| `distance_m`              | `distanceM`                       |
| `last_updated`            | `lastUpdated`                     |
| `arrival_time`            | `arrivalTime`                     |
| `departure_time`          | `departureTime`                   |
| `feed_timestamp`          | `feedTimestamp`                   |
| `wheelchair_boarding`     | `wheelchairBoarding`              |
| `transport_type`          | `transportType`                   |
| `latitude`/`longitude`    | `lat`/`lon` (shortened)           |
| `bearing`                 | `heading` (semantic rename)       |

### Type Definitions

All camelCase TypeScript interfaces are defined in `frontend/src/api/types.ts`:

- **`VehiclePosition`** — Live bus/train marker data
- **`Route`** — Route metadata (name, color, shape polyline)
- **`VehicleArrivals`** — Arrival times for a vehicle's trip
- **`VehicleArrivalStop`** — A single stop within a trip's arrival list
- **`Stop`** — A transit stop with location and distance
- **`CacheStatus`** — Cache freshness metadata (stale, age, error)

### Polling Strategy

| Hook                    | Endpoint                   | Poll interval | Stale time |
|-------------------------|----------------------------|---------------|------------|
| `useVehiclePositions`   | `/api/vehicles`            | 10s           | 10s        |
| `useRoutes`             | `/api/routes`              | 60s           | 60s        |
| `useVehicleArrivals`    | `/api/vehicles/{id}/arrivals` | 10s        | 10s        |
| `useNearbyStops`        | `/api/stops/nearby`        | 10s           | 60s        |

## Configuration

All backend settings are loaded from environment variables in
`core/config.py` via the `Settings` frozen dataclass. Settings are cached
for the process lifetime with `@lru_cache`. See `.env.example` for the
full list of variables.

Key settings:

| Variable                  | Default | Purpose                          |
|---------------------------|---------|----------------------------------|
| `GRT_VEHICLE_POSITIONS_URL` | (required) | URL for the GRT bus GTFS-RT feed |
| `GRT_TRIP_UPDATES_URL`      | None    | URL for the GRT trip updates feed |
| `GRT_GTFS_STATIC_URL`       | (required) | URL for the GRT static GTFS zip  |
| `LRT_VEHICLE_POSITIONS_URL` | None    | Optional ION LRT vehicle feed    |
| `REFRESH_SECONDS`           | 30      | Seconds between cache refreshes  |
| `GRT_ALLOW_WEAK_TLS`        | False   | Allow weaker TLS ciphers         |
| `CORS_ALLOWED_ORIGINS`      | dev defaults | Comma-separated allowed CORS origins |

## Directory Layout Reference

```
backend/
├── app/main.py              # FastAPI entrypoint, CORS, startup/shutdown
├── api/routes.py            # API endpoint definitions
├── core/config.py           # Settings dataclass, env loading
├── services/
│   ├── cache.py             # In-memory cache with background refresh
│   ├── gtfs_realtime.py     # GTFS-realtime protobuf parsing
│   ├── gtfs_static.py       # GTFS static zip parsing + cached fetch
│   ├── gtfs_db.py           # SQLite persistence for static data
│   └── http_client.py       # Shared HTTPX client with optional weak TLS
└── tests/                   # pytest suite using FakeCache + monkeypatch

frontend/
├── src/
│   ├── api/
│   │   ├── client.ts        # fetch wrapper (apiGet<T>)
│   │   └── types.ts         # TypeScript interfaces (camelCase)
│   ├── hooks/
│   │   ├── useVehiclePositions.ts
│   │   ├── useRoutes.ts
│   │   ├── useVehicleArrivals.ts
│   │   └── useNearbyStops.ts
│   └── components/
│       ├── MapView.tsx       # Leaflet map, vehicle/stop/user markers
│       ├── MapBindings.tsx   # Debounced center change, zoom-to-location
│       └── ...               # VehicleMarker, TripStopMarker, etc.
```
