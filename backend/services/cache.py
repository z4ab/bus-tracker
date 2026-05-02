"""In-memory cache with background refresh for GTFS data."""

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.config import Settings, load_settings
from services import gtfs_realtime, gtfs_static

logger = logging.getLogger(__name__)


class Cache:
    """Cache for vehicle positions and static route metadata."""

    def __init__(self, settings: Settings) -> None:
        """Initialize cache storage and background task state."""
        self._settings = settings
        self._vehicles: List[Dict[str, Any]] = []
        self._routes: Dict[str, Dict[str, Any]] = {}
        self._last_updated: Optional[str] = None
        self._previous_positions: Dict[str, Dict[str, float]] = {}
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None

    def _compute_bearing(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> Optional[float]:
        """Compute initial bearing from (lat1, lon1) to (lat2, lon2)."""
        if lat1 == lat2 and lon1 == lon2:
            return None

        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_lon = math.radians(lon2 - lon1)

        x = math.sin(delta_lon) * math.cos(phi2)
        y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lon)

        bearing = math.degrees(math.atan2(x, y))
        return (bearing + 360) % 360

    def _apply_fallback_bearings(self, vehicles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fill missing bearings using the previous position for each vehicle."""
        next_previous: Dict[str, Dict[str, float]] = {}

        for vehicle in vehicles:
            vehicle_id = vehicle.get("vehicle_id")
            lat = vehicle.get("latitude")
            lon = vehicle.get("longitude")
            bearing = vehicle.get("bearing")

            has_position = (
                isinstance(lat, (int, float))
                and isinstance(lon, (int, float))
                and math.isfinite(lat)
                and math.isfinite(lon)
            )

            if vehicle_id and has_position:
                if bearing is None:
                    previous = self._previous_positions.get(vehicle_id)
                    if previous:
                        computed = self._compute_bearing(previous["lat"], previous["lon"], lat, lon)
                        if computed is not None:
                            vehicle["bearing"] = computed

                next_previous[vehicle_id] = {"lat": float(lat), "lon": float(lon)}

        self._previous_positions = next_previous
        return vehicles

    async def refresh_once(self) -> None:
        """Refresh vehicle positions and, if missing, static routes."""
        vehicles: List[Dict[str, Any]] = []
        routes: Dict[str, Dict[str, Any]] = {}

        vehicles = await gtfs_realtime.fetch_vehicle_positions(
            self._settings.GRT_VEHICLE_POSITIONS_URL,
            allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
        )

        # Static data changes infrequently; only fetch once per process.
        if not self._routes:
            routes = await gtfs_static.fetch_static_routes(
                self._settings.GRT_GTFS_STATIC_URL,
                allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
            )

        timestamp = datetime.now(timezone.utc).isoformat()

        async with self._lock:
            vehicles = self._apply_fallback_bearings(vehicles)
            self._vehicles = vehicles
            if routes:
                self._routes = routes
            self._last_updated = timestamp

    async def _run(self) -> None:
        """Continuously refresh the cache on a fixed interval."""
        while True:
            try:
                await self.refresh_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Cache refresh failed")
            await asyncio.sleep(self._settings.REFRESH_SECONDS)

    def start(self) -> None:
        """Start the background refresh task if it is not already running."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Stop the background refresh task gracefully."""
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def get_vehicles(self) -> List[Dict[str, Any]]:
        """Return a snapshot of the latest vehicle list."""
        async with self._lock:
            return list(self._vehicles)

    async def get_vehicle(self, vehicle_id: str) -> Optional[Dict[str, Any]]:
        """Return a single vehicle entry by ID, if present."""
        async with self._lock:
            for vehicle in self._vehicles:
                if vehicle.get("vehicle_id") == vehicle_id:
                    return dict(vehicle)
        return None

    async def get_routes(self) -> Dict[str, Dict[str, Any]]:
        """Return a snapshot of the route metadata map."""
        async with self._lock:
            return {route_id: dict(info) for route_id, info in self._routes.items()}

    async def get_last_updated(self) -> Optional[str]:
        """Return the last refresh timestamp in ISO 8601 format."""
        async with self._lock:
            return self._last_updated


_cache: Optional[Cache] = None


def get_cache() -> Cache:
    """Return the process-wide cache instance."""
    global _cache
    if _cache is None:
        _cache = Cache(load_settings())
    return _cache
