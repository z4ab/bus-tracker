from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.routes as routes_module

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
    # The response model adds explicit None for optional fields.
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
    # The response model adds explicit None for optional fields.
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
