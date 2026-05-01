from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.routes as routes_module


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

    async def get_vehicles(self):
        return list(self._vehicles)

    async def get_vehicle(self, vehicle_id: str):
        for vehicle in self._vehicles:
            if vehicle["vehicle_id"] == vehicle_id:
                return dict(vehicle)
        return None

    async def get_routes(self):
        return dict(self._routes)


def _build_app(monkeypatch):
    fake = FakeCache()
    monkeypatch.setattr(routes_module, "get_cache", lambda: fake)
    app = FastAPI()
    app.include_router(routes_module.router)
    return app, fake


def test_health(monkeypatch) -> None:
    app, _ = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_vehicles(monkeypatch) -> None:
    app, fake = _build_app(monkeypatch)
    client = TestClient(app)

    response = client.get("/api/vehicles")

    assert response.status_code == 200
    assert response.json() == {"vehicles": fake._vehicles}


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
    assert response.json() == {"routes": list(fake._routes.values())}
