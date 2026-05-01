"""In-memory cache with background refresh for GTFS data."""

import asyncio
import logging
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
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None

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
