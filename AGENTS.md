# AGENTS.md — Bus Tracker Project Conventions

## Project Structure

```
.
├── backend/                 # FastAPI service
│   ├── app/
│   │   └── main.py          # FastAPI app entrypoint (CORS, startup/shutdown)
│   ├── api/
│   │   └── routes.py        # API endpoint definitions
│   ├── core/
│   │   └── config.py        # Environment configuration
│   ├── services/
│   │   ├── cache.py         # In-memory cache with background refresh
│   │   ├── gtfs_db.py       # SQLite database for parsed static GTFS
│   │   ├── gtfs_realtime.py # GTFS-realtime feed fetcher
│   │   ├── gtfs_static.py   # GTFS static zip parser
│   │   └── http_client.py   # Shared HTTPX client
│   ├── tests/
│   │   ├── test_api.py
│   │   ├── test_gtfs_db.py
│   │   ├── test_gtfs_realtime.py
│   │   ├── test_gtfs_static.py
│   │   └── test_gtfs_static_cached.py
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/                # Vite + React + TypeScript
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts    # fetch wrapper for API calls
│   │   │   └── types.ts     # TypeScript interfaces (camelCase)
│   │   ├── hooks/
│   │   │   ├── useVehiclePositions.ts
│   │   │   ├── useRoutes.ts
│   │   │   ├── useNearbyStops.ts
│   │   │   └── useVehicleArrivals.ts
│   │   ├── components/
│   │   │   ├── MapView.tsx
│   │   │   └── MapBindings.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── .eslintrc.cjs
│   ├── .prettierrc.cjs
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Branch Naming

Use the following prefixes for branch names:

| Prefix       | Purpose                      |
|--------------|------------------------------|
| `feat/`      | New feature                  |
| `fix/`       | Bug fix                      |
| `refactor/`  | Code restructuring           |
| `docs/`      | Documentation changes        |
| `chore/`     | Build, CI, tooling           |

Examples: `feat/vehicle-filter`, `fix/null-bearing`, `refactor/cache-refresh`.

## Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

<optional body with details>

Closes #<issue-number>
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`.

Examples:
```
feat: add route colour markers to map

fix: handle null bearing in vehicle position hook

docs: create AGENTS.md with project conventions
```

## Backend Testing (pytest)

Tests live in `backend/tests/`. They use **`FakeCache`** with **`monkeypatch`** to
avoid real GTFS feeds:

```python
# backend/tests/test_api.py
class FakeCache:
    """In-memory stand-in for Cache that returns hardcoded test data."""
    async def get_vehicles(self):
        return [...]

def _build_app(monkeypatch):
    fake = FakeCache()
    monkeypatch.setattr(routes_module, "get_cache", lambda: fake)
    app = FastAPI()
    app.include_router(routes_module.router)
    return app, fake

def test_list_vehicles(monkeypatch):
    app, fake = _build_app(monkeypatch)
    client = TestClient(app)
    response = client.get("/api/vehicles")
    assert response.status_code == 200
```

Key points:
- Override `get_cache()` at the **module level** (routes or services) using `monkeypatch.setattr`.
- `FakeCache` implements the same async methods as the real `Cache` (`get_vehicles`, `get_routes`, etc.).
- Use FastAPI's `TestClient` to hit endpoints without a running server.
- No frontend tests exist yet.

Run tests:
```bash
cd backend
pytest .
```

## Frontend Patterns

### API snake_case → TypeScript camelCase

The backend returns JSON with **snake_case** keys. Every hook file defines a
`*Api` type mirroring the raw response, then a `to*()` mapper function that
transforms it into the camelCase TypeScript interface from `api/types.ts`.

**Pattern** (from `useVehiclePositions.ts`):
```typescript
// 1. Raw API type (snake_case)
type VehiclePositionApi = {
  vehicle_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  bearing?: number | null;
  route_id?: string | null;
};

// 2. Mapper function
const toVehiclePosition = (raw: VehiclePositionApi): VehiclePosition => ({
  id: raw.vehicle_id ?? "unknown",
  lat: raw.latitude ?? NaN,
  lon: raw.longitude ?? NaN,
  routeId: raw.route_id ?? undefined,
  heading: raw.bearing ?? undefined,
});
```

Mapping conventions:

| snake_case (API)     | camelCase (TypeScript)      |
|----------------------|-----------------------------|
| `vehicle_id`         | `id`                        |
| `route_id`           | `routeId`                   |
| `route_short_name`   | `shortName`                 |
| `stop_lat`           | `stopLat`                   |
| `distance_m`         | `distanceM`                 |
| `last_updated`       | `lastUpdated`               |
| `arrival_time`       | `arrivalTime`               |
| `feed_timestamp`     | `feedTimestamp`             |
| `wheelchair_boarding`| `wheelchairBoarding`        |

The `VehiclePosition` type shortens `vehicle_id` → `id` and maps `latitude`/`longitude` → `lat`/`lon`.

### Hooks

Each hook:
1. Uses `@tanstack/react-query` (`useQuery`).
2. Calls `apiGet<T>()` from `api/client.ts`.
3. Maps the raw response via a local `to*()` function.
4. Sets `staleTime` and `refetchInterval` for polling.

### Components

React components live in `src/components/` and use Tailwind CSS for styling.

## Dev Setup

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
cp ../.env.example .env   # edit with real feed URLs
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file .env
```

### Frontend
```bash
cd frontend
npm install
npm run dev                # starts Vite at http://localhost:5173
```

Or via Docker Compose:
```bash
docker compose up --build
# Backend at http://localhost:8000, Frontend at http://localhost:3001
```

## Lint / Format

### Backend
```bash
cd backend
ruff check .               # lint
black --check .            # formatting check
```

### Frontend
```bash
cd frontend
npm run lint               # ESLint
npm run format:check       # Prettier check
npm run format             # auto-format with Prettier
```

Frontend uses Prettier (printWidth 100, singleQuote off, trailingComma es5) and
ESLint with TypeScript + React plugins.
Backend uses Ruff (select E/F/I, ignore E501) and Black (line-length 88).
