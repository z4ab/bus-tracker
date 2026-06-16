"""
API routes for vehicles, routes, and health checks.
"""

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional

import tomllib
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from services.cache import Cache, get_cache

logger = logging.getLogger(__name__)

router = APIRouter()

# Read version from pyproject.toml at import time
_PYPROJECT_PATH = Path(__file__).resolve().parent.parent / "pyproject.toml"
try:
    _match = re.search(r'^version\s*=\s*"([^"]+)"', _PYPROJECT_PATH.read_text(), re.M)
    APP_VERSION: str = _match.group(1) if _match else "unknown"
except Exception:
    APP_VERSION = "unknown"


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------


class VehiclePositionItem(BaseModel):
    """A single vehicle position from the GTFS-realtime feed."""

    model_config = ConfigDict(extra="allow")

    vehicle_id: Optional[str] = None
    trip_id: Optional[str] = None
    route_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    bearing: Optional[float] = None
    speed: Optional[float] = None
    timestamp: Optional[int] = None
    transport_type: Optional[str] = None


class RouteItem(BaseModel):
    """A single route from the GTFS static schedule."""

    model_config = ConfigDict(extra="allow")

    route_id: Optional[str] = None
    route_short_name: Optional[str] = None
    route_long_name: Optional[str] = None
    route_color: Optional[str] = None
    route_text_color: Optional[str] = None


class StopItem(BaseModel):
    """A single stop enriched with distance metadata."""

    model_config = ConfigDict(extra="allow")

    stop_id: Optional[str] = None
    stop_name: Optional[str] = None
    stop_lat: Optional[float] = None
    stop_lon: Optional[float] = None
    distance_m: Optional[float] = None


class ArrivalStopItem(BaseModel):
    """A stop-time entry within a trip update, enriched with stop info."""

    model_config = ConfigDict(extra="allow")

    stop_id: Optional[str] = None
    stop_sequence: Optional[int] = None
    arrival_time: Optional[int] = None
    arrival_delay: Optional[int] = None
    departure_time: Optional[int] = None
    departure_delay: Optional[int] = None
    stop_name: Optional[str] = None
    stop_lat: Optional[float] = None
    stop_lon: Optional[float] = None


class DepartureItem(BaseModel):
    """A single departure for a stop, either predicted or scheduled."""

    trip_id: str
    route_id: str
    route_short_name: Optional[str] = None
    route_color: Optional[str] = None
    stop_id: str
    arrival_time: Optional[int] = None
    departure_time: Optional[int] = None
    type: str  # "predicted" or "scheduled"
    minutes_away: Optional[int] = None


class StopDeparturesResponse(BaseModel):
    """Response with upcoming departures for a stop."""

    stop_id: str
    departures: List[DepartureItem]


class HealthResponse(BaseModel):
    """Response from the /health endpoint."""

    status: str
    version: str
    last_updated: Optional[str] = None
    cache: Dict[str, int]
    feeds: Dict[str, str]


class VehiclesResponse(BaseModel):
    """Response listing all active vehicle positions."""

    vehicles: List[VehiclePositionItem]
    last_updated: Optional[str] = None
    last_refresh_age_seconds: Optional[int] = None
    stale: bool
    refresh_error: Optional[str] = None


class VehicleResponse(BaseModel):
    """Response wrapping a single vehicle."""

    model_config = ConfigDict(extra="allow")

    vehicle: Optional[VehiclePositionItem] = None


class RoutesResponse(BaseModel):
    """Response listing all known routes."""

    routes: List[RouteItem]


class NearbyStopsResponse(BaseModel):
    """Response listing stops near a given coordinate."""

    stops: List[StopItem]


class VehicleArrivalsResponse(BaseModel):
    """Response with upcoming stop arrivals for a vehicle's active trip."""

    model_config = ConfigDict(extra="allow")

    vehicle_id: str
    trip_id: str
    route_id: Optional[str] = None
    feed_timestamp: Optional[int] = None
    updated_at: Optional[str] = None
    stops: List[ArrivalStopItem]


# Read version from pyproject.toml at import time
_PYPROJECT_PATH = Path(__file__).resolve().parent.parent / "pyproject.toml"
try:
    with open(_PYPROJECT_PATH, "rb") as f:
        _pyproject = tomllib.load(f)
    APP_VERSION: str = _pyproject["project"]["version"]
except Exception:
    APP_VERSION = "unknown"


@router.get(
    "/health",
    response_model=HealthResponse,
    tags=["health"],
    summary="Health check with cache and feed metadata",
)
async def health() -> HealthResponse:
    cache = get_cache()
    last_updated = await cache.get_last_updated()
    cache_sizes = await cache.get_cache_sizes()
    feed_health = await cache.get_feed_health()
    return JSONResponse(
        content={
            "status": "ok",
            "version": APP_VERSION,
            "last_updated": last_updated,
            "cache": cache_sizes,
            "feeds": feed_health,
        },
        headers={"Cache-Control": "no-cache"},
    )


@router.post("/api/refresh")
async def refresh_cache() -> Dict[str, str]:
    """Force an immediate refresh of the GTFS cache."""
    cache: Cache = get_cache()
    await cache.refresh_once()
    logger.info("Manual cache refresh triggered via /api/refresh")
    return JSONResponse(
        content={"status": "ok"},
        headers={"Cache-Control": "no-cache"},
    )


@router.get(
    "/api/vehicles",
    response_model=VehiclesResponse,
    tags=["vehicles"],
    summary="List active vehicle positions",
)
async def list_vehicles() -> VehiclesResponse:
    cache = get_cache()
    vehicles = await cache.get_vehicles()
    status = await cache.get_cache_status()
    return JSONResponse(
        content={"vehicles": vehicles, **status},
        headers={"Cache-Control": "public, max-age=5, stale-while-revalidate=15"},
    )


@router.get(
    "/api/vehicles/{vehicle_id}",
    response_model=VehicleResponse,
    tags=["vehicles"],
    summary="Get a single vehicle by ID",
)
async def get_vehicle(vehicle_id: str) -> VehicleResponse:
    cache = get_cache()
    vehicle = await cache.get_vehicle(vehicle_id)
    if not vehicle:
        logger.info("Vehicle not found: %s", vehicle_id)
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return JSONResponse(
        content={"vehicle": vehicle},
        headers={"Cache-Control": "public, max-age=5, stale-while-revalidate=15"},
    )


@router.get(
    "/api/routes",
    response_model=RoutesResponse,
    tags=["routes"],
    summary="List all transit routes",
)
async def list_routes() -> RoutesResponse:
    cache = get_cache()
    routes = await cache.get_routes()
    return JSONResponse(
        content={"routes": list(routes.values())},
        headers={"Cache-Control": "public, max-age=60, stale-while-revalidate=300"},
    )


@router.get(
    "/api/stops/nearby",
    response_model=NearbyStopsResponse,
    tags=["stops"],
    summary="Find stops near a coordinate",
)
async def nearby_stops(
    lat: float, lon: float, radius: float = 500.0, limit: int = 20
) -> NearbyStopsResponse:
    cache = get_cache()
    stops = await cache.get_nearby_stops(lat, lon, radius, limit)
    return JSONResponse(
        content={"stops": stops},
        headers={"Cache-Control": "public, max-age=10, stale-while-revalidate=30"},
    )


@router.get(
    "/api/stops/{stop_id}/departures",
    response_model=StopDeparturesResponse,
    tags=["stops"],
    summary="Get upcoming departures for a stop",
)
async def get_stop_departures(
    stop_id: str, limit: int = 10, route_id: Optional[str] = None
) -> StopDeparturesResponse:
    cache = get_cache()
    departures = await cache.get_stop_departures(
        stop_id, limit=limit, route_id=route_id
    )
    return JSONResponse(
        content={"stop_id": stop_id, "departures": departures},
        headers={"Cache-Control": "public, max-age=10, stale-while-revalidate=30"},
    )


@router.get(
    "/api/vehicles/{vehicle_id}/arrivals",
    response_model=VehicleArrivalsResponse,
    tags=["vehicles"],
    summary="Get upcoming arrivals for a vehicle",
)
async def get_vehicle_arrivals(vehicle_id: str) -> VehicleArrivalsResponse:
    cache = get_cache()
    vehicle = await cache.get_vehicle(vehicle_id)
    if not vehicle:
        logger.info("Vehicle not found: %s", vehicle_id)
        raise HTTPException(status_code=404, detail="Vehicle not found")

    trip_id = vehicle.get("trip_id")
    if not trip_id:
        raise HTTPException(status_code=404, detail="Trip not found for vehicle")

    updated_at = await cache.get_last_updated()
    details = await cache.get_trip_details(trip_id)

    if not details:
        return JSONResponse(
            content={
                "vehicle_id": vehicle_id,
                "trip_id": trip_id,
                "route_id": vehicle.get("route_id"),
                "updated_at": updated_at,
                "stops": [],
            },
            headers={"Cache-Control": "public, max-age=10, stale-while-revalidate=30"},
        )

    return JSONResponse(
        content={
            "vehicle_id": vehicle_id,
            "trip_id": trip_id,
            "route_id": details.get("route_id") or vehicle.get("route_id"),
            "feed_timestamp": details.get("timestamp"),
            "updated_at": updated_at,
            "stops": details.get("stop_time_updates", []),
        },
        headers={"Cache-Control": "public, max-age=10, stale-while-revalidate=30"},
    )
