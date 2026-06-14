"""In-memory cache with background refresh for GTFS data."""

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.config import Settings, load_settings
from services import gtfs_realtime, gtfs_static
from services.departure_query import DepartureQuery
from services.geo_query import GeoQuery

logger = logging.getLogger(__name__)


class Cache:
    """Cache for vehicle positions and static route metadata."""

    def __init__(self, settings: Settings) -> None:
        """Initialize cache storage and background task state."""
        self._settings = settings
        self._vehicles: List[Dict[str, Any]] = []
        self._routes: Dict[str, Dict[str, Any]] = {}
        self._stops: Dict[str, Dict[str, Any]] = {}
        self._trip_updates: List[Dict[str, Any]] = []
        self._last_updated: Optional[str] = None
        self._last_updated_at: Optional[datetime] = None
        self._refresh_failed: bool = False
        self._refresh_error: Optional[str] = None
        self._feed_health: Dict[str, str] = {}
        self._previous_positions: Dict[str, Dict[str, float]] = {}
        self._lock = asyncio.Lock()
        self._refresh_lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._geo = GeoQuery()
        self._departure = DepartureQuery()

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
        y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(
            phi2
        ) * math.cos(delta_lon)

        bearing = math.degrees(math.atan2(x, y))
        return (bearing + 360) % 360

    def _apply_fallback_bearings(
        self, vehicles: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
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
                        computed = self._compute_bearing(
                            previous["lat"], previous["lon"], lat, lon
                        )
                        if computed is not None:
                            vehicle["bearing"] = computed

                next_previous[vehicle_id] = {"lat": float(lat), "lon": float(lon)}

        self._previous_positions = next_previous
        return vehicles

    async def _needs_refresh(self) -> bool:
        """Return True when cached data is missing or stale."""
        refresh_seconds = self._settings.REFRESH_SECONDS
        if refresh_seconds <= 0:
            return True

        async with self._lock:
            last_updated_at = self._last_updated_at

        if last_updated_at is None:
            return True

        age_seconds = (datetime.now(timezone.utc) - last_updated_at).total_seconds()
        return age_seconds >= refresh_seconds

    async def ensure_fresh(self) -> None:
        """Refresh the cache if it's empty or stale."""
        if not await self._needs_refresh():
            return

        async with self._refresh_lock:
            if not await self._needs_refresh():
                return
            try:
                await self.refresh_once()
            except Exception:
                logger.exception("On-demand cache refresh failed")

    async def refresh_once(self) -> None:
        """Refresh vehicle positions, trip updates, and static data for GRT and LRT."""
        vehicles: List[Dict[str, Any]] = []
        routes: Dict[str, Dict[str, Any]] = {}
        stops: Dict[str, Dict[str, Any]] = {}
        trip_updates: Optional[List[Dict[str, Any]]] = None
        any_failure = False

        # Fetch GRT (bus) data
        try:
            grt_vehicles = await gtfs_realtime.fetch_vehicle_positions(
                self._settings.GRT_VEHICLE_POSITIONS_URL,
                allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
            )
            for vehicle in grt_vehicles:
                vehicle["transport_type"] = "bus"
            vehicles.extend(grt_vehicles)
            self._feed_health["grt_vehicle_positions"] = "ok"
        except Exception:
            logger.exception("Failed to fetch GRT vehicle positions")
            self._feed_health["grt_vehicle_positions"] = "error"
            any_failure = True

        # Fetch LRT data if configured
        if self._settings.LRT_VEHICLE_POSITIONS_URL:
            try:
                lrt_vehicles = await gtfs_realtime.fetch_vehicle_positions(
                    self._settings.LRT_VEHICLE_POSITIONS_URL,
                    allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                )
                for vehicle in lrt_vehicles:
                    vehicle["transport_type"] = "lrt"
                vehicles.extend(lrt_vehicles)
                self._feed_health["lrt_vehicle_positions"] = "ok"
            except Exception:
                logger.exception("Failed to fetch LRT vehicle positions")
                self._feed_health["lrt_vehicle_positions"] = "error"
                any_failure = True

        if self._settings.GRT_TRIP_UPDATES_URL:
            try:
                trip_updates = await gtfs_realtime.fetch_trip_updates(
                    self._settings.GRT_TRIP_UPDATES_URL,
                    allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                )
                for update in trip_updates:
                    update["transport_type"] = "bus"
                self._feed_health["grt_trip_updates"] = "ok"
            except Exception:
                logger.exception("Failed to fetch GTFS-realtime trip updates")
                self._feed_health["grt_trip_updates"] = "error"
                any_failure = True

        # Fetch LRT trip updates if configured
        if self._settings.LRT_TRIP_UPDATES_URL:
            try:
                lrt_updates = await gtfs_realtime.fetch_trip_updates(
                    self._settings.LRT_TRIP_UPDATES_URL,
                    allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                )
                for update in lrt_updates:
                    update["transport_type"] = "lrt"
                if trip_updates:
                    trip_updates.extend(lrt_updates)
                else:
                    trip_updates = lrt_updates
            except Exception:
                logger.exception("Failed to fetch LRT trip updates")
                any_failure = True

        # Static data changes infrequently; prefer SQLite cache and only
        # re-fetch when the feed's Last-Modified / ETag changes.
        if not self._routes or not self._stops:
            try:
                bundle = await gtfs_static.fetch_static_bundle_cached(
                    self._settings.GRT_GTFS_STATIC_URL,
                    allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                )
                routes = bundle.get("routes", {})
                stops = bundle.get("stops", {})
                self._feed_health["grt_static"] = "ok"
            except Exception:
                logger.exception("Failed to fetch GRT static data")
                self._feed_health["grt_static"] = "error"
                any_failure = True

            # Fetch LRT static data if configured
            if self._settings.LRT_GTFS_STATIC_URL:
                try:
                    lrt_bundle = await gtfs_static.fetch_static_bundle_cached(
                        self._settings.LRT_GTFS_STATIC_URL,
                        allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                    )
                    lrt_routes = lrt_bundle.get("routes", {})
                    lrt_stops = lrt_bundle.get("stops", {})
                    routes.update(lrt_routes)
                    stops.update(lrt_stops)
                    self._feed_health["lrt_static"] = "ok"
                except Exception:
                    logger.exception("Failed to fetch LRT static data")
                    self._feed_health["lrt_static"] = "error"

        now = datetime.now(timezone.utc)
        timestamp = now.isoformat()

        async with self._lock:
            vehicles = self._apply_fallback_bearings(vehicles)
            self._vehicles = vehicles
            if trip_updates is not None:
                self._trip_updates = trip_updates
            if routes:
                self._routes = routes
            if stops:
                self._stops = stops
            self._last_updated = timestamp
            self._last_updated_at = now
            if any_failure:
                self._refresh_failed = True
                self._refresh_error = "One or more GTFS feeds failed to refresh"
            else:
                self._refresh_failed = False
                self._refresh_error = None

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
        await self.ensure_fresh()
        async with self._lock:
            return list(self._vehicles)

    async def get_vehicle(self, vehicle_id: str) -> Optional[Dict[str, Any]]:
        """Return a single vehicle entry by ID, if present."""
        await self.ensure_fresh()
        async with self._lock:
            for vehicle in self._vehicles:
                if vehicle.get("vehicle_id") == vehicle_id:
                    return dict(vehicle)
        return None

    async def get_routes(self) -> Dict[str, Dict[str, Any]]:
        """Return a snapshot of the route metadata map."""
        await self.ensure_fresh()
        async with self._lock:
            return {route_id: dict(info) for route_id, info in self._routes.items()}

    async def get_stops(self) -> Dict[str, Dict[str, Any]]:
        """Return a snapshot of the stop metadata map."""
        await self.ensure_fresh()
        async with self._lock:
            return {stop_id: dict(info) for stop_id, info in self._stops.items()}

    async def get_nearby_stops(
        self, lat: float, lon: float, radius_m: float = 500.0, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Return stops within *radius_m* of (lat, lon), sorted by distance."""
        await self.ensure_fresh()
        async with self._lock:
            stops_snapshot = {sid: dict(info) for sid, info in self._stops.items()}
        return self._geo.nearby_stops(stops_snapshot, lat, lon, radius_m, limit)

    async def get_trip_updates(self) -> List[Dict[str, Any]]:
        """Return a snapshot of the latest trip updates."""
        await self.ensure_fresh()
        async with self._lock:
            return [dict(update) for update in self._trip_updates]

    async def get_trip_details(self, trip_id: str) -> Optional[Dict[str, Any]]:
        """Return enriched stop-time details for a trip, or None if not found.

        The returned dict carries all fields from the matching trip update
        (including the stop-time list) with stop_name / stop_lat / stop_lon
        merged into each stop entry.
        """
        await self.ensure_fresh()
        async with self._lock:
            trip_updates_snapshot = [dict(u) for u in self._trip_updates]
            stops_snapshot = {sid: dict(info) for sid, info in self._stops.items()}
        return self._departure.get_trip_details(
            trip_updates_snapshot, stops_snapshot, trip_id
        )

    async def get_last_updated(self) -> Optional[str]:
        """Return the last refresh timestamp in ISO 8601 format."""
        async with self._lock:
            return self._last_updated

    async def get_cache_sizes(self) -> Dict[str, int]:
        """Return the count of items currently held in each cache bucket."""
        async with self._lock:
            return {
                "vehicles": len(self._vehicles),
                "routes": len(self._routes),
                "stops": len(self._stops),
                "trip_updates": len(self._trip_updates),
            }

    async def get_feed_health(self) -> Dict[str, str]:
        """Return the health status of each GTFS feed."""
        async with self._lock:
            return dict(self._feed_health)

    async def get_cache_status(self) -> Dict[str, Any]:
        """Return cache freshness metadata including staleness info.

        Returns a dict with:
          - last_updated: ISO 8601 timestamp of last successful refresh
          - last_refresh_age_seconds: seconds since last refresh
          - stale: True if a feed refresh failed or data is too old
          - refresh_error: error message if a feed failed, else None
        """
        async with self._lock:
            last_updated = self._last_updated
            last_updated_at = self._last_updated_at
            refresh_failed = self._refresh_failed
            refresh_error = self._refresh_error

        age_seconds: Optional[int] = None
        stale = False
        if last_updated_at is not None:
            age_seconds = int(
                (datetime.now(timezone.utc) - last_updated_at).total_seconds()
            )
            # Consider data stale if age exceeds 2x the refresh interval
            stale_age = self._settings.REFRESH_SECONDS * 2
            if age_seconds >= stale_age:
                stale = True

        if refresh_failed:
            stale = True

        return {
            "last_updated": last_updated,
            "last_refresh_age_seconds": age_seconds,
            "stale": stale,
            "refresh_error": refresh_error,
        }


_cache: Optional[Cache] = None


def get_cache() -> Cache:
    """Return the process-wide cache instance."""
    global _cache
    if _cache is None:
        _cache = Cache(load_settings())
    return _cache
