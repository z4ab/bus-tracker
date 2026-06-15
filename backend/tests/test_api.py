from typing import Optional

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.routes as routes_module
from services.departure_query import _stop_time_to_timestamp

APP_VERSION = "0.1.0"


class FakeCache:
    def __init__(self) -> None:
        self._vehicles = [
            {
                "vehicle_id": "veh-1",
                "trip_id": "trip-1",
                "route_id": "route-1",
                "latitude": 43.0,
                "longitude": -80.0,
                "bearing": 90.0,
                "speed": 10.0,
                "timestamp": 1710000000,
            }
        ]
        self._routes = {
            "route-1": {
                "route_id": "route-1",
                "route_short_name": "1",
                "route_color": "#123456",
            }
        }
        self._stops = {
            "stop-1": {
                "stop_name": "Main St",
                "stop_lat": 43.1,
                "stop_lon": -80.1,
            }
        }
        self._stop_times = {
            "trip-1": [
                {
                    "stop_id": "stop-1",
                    "stop_sequence": 1,
                    "arrival_time": "08:00:00",
                    "departure_time": "08:05:00",
                },
                {
                    "stop_id": "stop-2",
                    "stop_sequence": 2,
                    "arrival_time": "08:15:00",
                    "departure_time": "08:20:00",
                },
            ],
            "trip-2": [
                {
                    "stop_id": "stop-1",
                    "stop_sequence": 1,
                    "arrival_time": "09:00:00",
                    "departure_time": "09:05:00",
                },
            ],
        }
        self._trip_routes = {
            "trip-1": "route-1",
            "trip-2": "route-1",
        }
        self._trip_details = {
            "trip-1": {
                "trip_id": "trip-1",
                "route_id": "route-1",
                "timestamp": 1710000100,
                "stop_time_updates": [
                    {
                        "stop_id": "stop-1",
                        "stop_sequence": 1,
                        "arrival_time": 1710003600,
                    }
                ],
            }
        }
        self._last_updated = "2025-03-09T12:00:00Z"
        self._feed_health = {
            "grt_vehicle_positions": "ok",
            "lrt_vehicle_positions": "ok",
            "grt_trip_updates": "ok",
            "grt_static": "ok",
        }

    async def get_vehicles(self):
        return list(self._vehicles)

    async def get_vehicle(self, vehicle_id: str):
        for vehicle in self._vehicles:
            if vehicle["vehicle_id"] == vehicle_id:
                return dict(vehicle)
        return None

    async def get_routes(self):
        return dict(self._routes)

    async def get_cache_status(self) -> dict:
        return {
            "last_updated": self._last_updated,
            "last_refresh_age_seconds": None,
            "stale": False,
            "refresh_error": None,
        }

    async def get_last_updated(self):
        return self._last_updated

    async def get_cache_sizes(self) -> dict:
        return {
            "vehicles": len(self._vehicles),
            "routes": len(self._routes),
            "stops": len(self._stops),
            "stop_times": len(self._stop_times),
            "trip_routes": len(self._trip_routes),
            "trip_updates": 0,
        }

    async def get_feed_health(self) -> dict:
        return dict(self._feed_health)

    async def get_trip_details(self, trip_id: str):
        update = self._trip_details.get(trip_id)
        if update is None:
            return None
        result = dict(update)
        enriched_stops = []
        for stop_update in update.get("stop_time_updates", []):
            entry = dict(stop_update)
            stop_id = stop_update.get("stop_id")
            if stop_id and stop_id in self._stops:
                info = self._stops[stop_id]
                entry["stop_name"] = info.get("stop_name")
                entry["stop_lat"] = info.get("stop_lat")
                entry["stop_lon"] = info.get("stop_lon")
            enriched_stops.append(entry)
        result["stop_time_updates"] = enriched_stops
        return result

    async def get_stop_departures(self, stop_id: str, limit: int = 10, route_id: Optional[str] = None):
        from datetime import datetime, timezone

        departures = []
        now = datetime.now(timezone.utc)
        now_ts = int(now.timestamp())
        today = now.date()

        for tid, entries in self._stop_times.items():
            for entry in entries:
                if entry.get("stop_id") != stop_id:
                    continue
                rid = self._trip_routes.get(tid)
                if not rid:
                    continue
                if route_id is not None and rid != route_id:
                    continue
                route_info = self._routes.get(rid, {})

                trip_update = self._trip_details.get(tid)
                if trip_update:
                    for stu in trip_update.get("stop_time_updates", []):
                        if stu.get("stop_id") == stop_id:
                            arr = stu.get("arrival_time")
                            dep = stu.get("departure_time")
                            deptype = "predicted"
                            break
                    else:
                        continue
                else:
                    arr_str = entry.get("arrival_time")
                    dep_str = entry.get("departure_time")
                    arr = (
                        _stop_time_to_timestamp(arr_str, today)
                        if arr_str
                        else None
                    )
                    dep = (
                        _stop_time_to_timestamp(dep_str, today)
                        if dep_str
                        else None
                    )
                    deptype = "scheduled"

                ref = dep if dep is not None else arr
                if ref is None:
                    continue
                minutes_away = (ref - now_ts) // 60

                departures.append({
                    "trip_id": tid,
                    "route_id": rid,
                    "route_short_name": route_info.get("route_short_name"),
                    "route_color": route_info.get("route_color"),
                    "stop_id": stop_id,
                    "arrival_time": arr,
                    "departure_time": dep,
                    "type": deptype,
                    "minutes_away": minutes_away,
                })
                break

        departures.sort(
            key=lambda d: d["departure_time"]
            if d["departure_time"] is not None
            else (d["arrival_time"] or 0)
        )
        return departures[:limit]


def _build_app(monkeypatch):
    fake = FakeCache()
    monkeypatch.setattr(routes_module, "get_cache", lambda: fake)
    app = FastAPI()
    app.include_router(routes_module.router)
    return app, fake


def test_health(monkeypatch) -> None:
    app, fake = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == APP_VERSION
    assert data["last_updated"] == fake._last_updated
    assert data["cache"] == {
        "vehicles": 1,
        "routes": 1,
        "stops": 1,
        "stop_times": 2,
        "trip_routes": 2,
        "trip_updates": 0,
    }
    assert data["feeds"] == {
        "grt_vehicle_positions": "ok",
        "lrt_vehicle_positions": "ok",
        "grt_trip_updates": "ok",
        "grt_static": "ok",
    }


def test_list_vehicles(monkeypatch) -> None:
    app, fake = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/vehicles")

    assert response.status_code == 200
    data = response.json()
    assert len(data["vehicles"]) == 1
    vehicle = data["vehicles"][0]
    assert vehicle["vehicle_id"] == "veh-1"
    assert vehicle["trip_id"] == "trip-1"
    assert vehicle["route_id"] == "route-1"
    assert vehicle["latitude"] == 43.0
    assert vehicle["longitude"] == -80.0
    assert vehicle["bearing"] == 90.0
    assert vehicle["speed"] == 10.0
    assert vehicle["timestamp"] == 1710000000
    assert vehicle["transport_type"] is None
    assert data["stale"] is False
    assert data["last_refresh_age_seconds"] is None
    assert data["last_updated"] == "2025-03-09T12:00:00Z"


def test_get_vehicle(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/vehicles/veh-1")

    assert response.status_code == 200
    assert response.json()["vehicle"]["vehicle_id"] == "veh-1"


def test_get_vehicle_not_found(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/vehicles/missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "Vehicle not found"


def test_list_routes(monkeypatch) -> None:
    app, fake = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/routes")

    assert response.status_code == 200
    data = response.json()
    assert len(data["routes"]) == 1
    route = data["routes"][0]
    assert route["route_id"] == "route-1"
    assert route["route_short_name"] == "1"
    assert route["route_long_name"] is None
    assert route["route_color"] == "#123456"
    assert route["route_text_color"] is None


def test_get_vehicle_arrivals(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/vehicles/veh-1/arrivals")

    assert response.status_code == 200
    data = response.json()
    assert data["vehicle_id"] == "veh-1"
    assert data["trip_id"] == "trip-1"
    assert data["route_id"] == "route-1"
    assert data["feed_timestamp"] == 1710000100
    assert data["updated_at"] == "2025-03-09T12:00:00Z"
    assert len(data["stops"]) == 1
    assert data["stops"][0]["stop_id"] == "stop-1"
    assert data["stops"][0]["stop_name"] == "Main St"


def test_get_vehicle_arrivals_no_trip(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/vehicles/veh-1/arrivals")

    assert response.status_code == 200


def test_get_vehicle_arrivals_not_found(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/vehicles/missing/arrivals")

    assert response.status_code == 404
    assert response.json()["detail"] == "Vehicle not found"


def test_get_stop_departures(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/stops/stop-1/departures")

    assert response.status_code == 200
    data = response.json()
    assert data["stop_id"] == "stop-1"
    assert len(data["departures"]) == 2

    predicted = next(d for d in data["departures"] if d["trip_id"] == "trip-1")
    assert predicted["type"] == "predicted"
    assert predicted["route_id"] == "route-1"
    assert predicted["arrival_time"] == 1710003600

    scheduled = next(d for d in data["departures"] if d["trip_id"] == "trip-2")
    assert scheduled["type"] == "scheduled"
    assert scheduled["route_id"] == "route-1"

    assert data["departures"][0]["trip_id"] == "trip-1"


def test_get_stop_departures_with_limit(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/stops/stop-1/departures?limit=1")

    assert response.status_code == 200
    data = response.json()
    assert len(data["departures"]) == 1


def test_get_stop_departures_with_route_filter(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/stops/stop-1/departures?route_id=route-1")
    assert response.status_code == 200
    data = response.json()
    assert len(data["departures"]) == 2

    response = client.get("/api/stops/stop-1/departures?route_id=route-404")
    assert response.status_code == 200
    data = response.json()
    assert len(data["departures"]) == 0


def test_get_stop_departures_no_such_stop(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/stops/stop-999/departures")

    assert response.status_code == 200
    data = response.json()
    assert data["stop_id"] == "stop-999"
    assert len(data["departures"]) == 0
