"""API routes for vehicles, routes, and health checks."""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from core.config import load_settings
from services.cache import get_cache

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health() -> Dict[str, str]:
    """Return a simple readiness response."""
    return {"status": "ok"}


@router.get("/api/vehicles")
async def list_vehicles() -> Dict[str, List[Dict[str, Any]]]:
    """Return the latest vehicle positions."""
    cache = get_cache()
    vehicles = await cache.get_vehicles()
    return {"vehicles": vehicles}


@router.get("/api/vehicles/{vehicle_id}")
async def get_vehicle(vehicle_id: str) -> Dict[str, Dict[str, Any]]:
    """Return a single vehicle by its identifier."""
    cache = get_cache()
    vehicle = await cache.get_vehicle(vehicle_id)
    if not vehicle:
        logger.info("Vehicle not found: %s", vehicle_id)
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"vehicle": vehicle}


@router.get("/api/routes")
async def list_routes() -> Dict[str, List[Dict[str, Any]]]:
    """Return route metadata from the GTFS static feed."""
    cache = get_cache()
    routes = await cache.get_routes()
    return {"routes": list(routes.values())}


@router.get("/api/vehicles/{vehicle_id}/arrivals")
async def get_vehicle_arrivals(vehicle_id: str) -> Dict[str, Any]:
    """Return upcoming stop times for the vehicle's active trip."""
    settings = load_settings()
    if not settings.GRT_TRIP_UPDATES_URL:
        raise HTTPException(
            status_code=503,
            detail="Trip updates feed is not configured",
        )

    cache = get_cache()
    vehicle = await cache.get_vehicle(vehicle_id)
    if not vehicle:
        logger.info("Vehicle not found: %s", vehicle_id)
        raise HTTPException(status_code=404, detail="Vehicle not found")

    trip_id = vehicle.get("trip_id")
    if not trip_id:
        raise HTTPException(status_code=404, detail="Trip not found for vehicle")

    trip_updates = await cache.get_trip_updates()
    update = next(
        (item for item in trip_updates if item.get("trip_id") == trip_id), None
    )
    updated_at = await cache.get_last_updated()

    if not update:
        return {
            "vehicle_id": vehicle_id,
            "trip_id": trip_id,
            "route_id": vehicle.get("route_id"),
            "updated_at": updated_at,
            "stops": [],
        }

    stops_index = await cache.get_stops()
    stops = []
    for stop_update in update.get("stop_time_updates", []):
        stop_id = stop_update.get("stop_id")
        stop_name = None
        if stop_id:
            stop_name = stops_index.get(stop_id, {}).get("stop_name")
        stops.append({**stop_update, "stop_name": stop_name})

    return {
        "vehicle_id": vehicle_id,
        "trip_id": trip_id,
        "route_id": update.get("route_id") or vehicle.get("route_id"),
        "feed_timestamp": update.get("timestamp"),
        "updated_at": updated_at,
        "stops": stops,
    }
