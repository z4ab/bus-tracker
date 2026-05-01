"""API routes for vehicles, routes, and health checks."""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from services.cache import get_cache

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health() -> Dict[str, str]:
    """Return a simple readiness response."""
    return {"status": "ok"}


@router.get("/api/vehicles")
async def list_vehicles() -> Dict[str, List[Dict[str, Any]]]:
    """Return the latest cached vehicle positions."""
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
