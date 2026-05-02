"""API routes for vehicles, routes, and health checks."""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from core.config import load_settings
from services import gtfs_realtime, gtfs_static

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health() -> Dict[str, str]:
    """Return a simple readiness response."""
    return {"status": "ok"}


@router.get("/api/vehicles")
async def list_vehicles() -> Dict[str, List[Dict[str, Any]]]:
    """Return the latest vehicle positions."""
    settings = load_settings()
    vehicles = await gtfs_realtime.fetch_vehicle_positions(
        settings.GRT_VEHICLE_POSITIONS_URL,
        allow_weak_tls=settings.GRT_ALLOW_WEAK_TLS,
    )
    return {"vehicles": vehicles}


@router.get("/api/vehicles/{vehicle_id}")
async def get_vehicle(vehicle_id: str) -> Dict[str, Dict[str, Any]]:
    """Return a single vehicle by its identifier."""
    settings = load_settings()
    vehicles = await gtfs_realtime.fetch_vehicle_positions(
        settings.GRT_VEHICLE_POSITIONS_URL,
        allow_weak_tls=settings.GRT_ALLOW_WEAK_TLS,
    )
    vehicle = next((item for item in vehicles if item.get("vehicle_id") == vehicle_id), None)
    if not vehicle:
        logger.info("Vehicle not found: %s", vehicle_id)
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"vehicle": vehicle}


@router.get("/api/routes")
async def list_routes() -> Dict[str, List[Dict[str, Any]]]:
    """Return route metadata from the GTFS static feed."""
    settings = load_settings()
    routes = await gtfs_static.fetch_static_routes(
        settings.GRT_GTFS_STATIC_URL,
        allow_weak_tls=settings.GRT_ALLOW_WEAK_TLS,
    )
    return {"routes": list(routes.values())}
