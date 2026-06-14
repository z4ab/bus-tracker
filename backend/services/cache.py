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
        self._stops: Dict[str, Dict[str, Any]] = {}
        self._trip_updates: List[Dict[str, Any]] = []
        self._last_updated: Optional[str] = None
        self._last_updated_at: Optional[datetime] = None
        self._previous_positions: Dict[str, Dict[str, float]] = {}
        self._lock = asyncio.Lock()
        self._refresh_lock = asyncio.Lock()
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

        # Fetch GRT (bus) data
        grt_vehicles = await gtfs_realtime.fetch_vehicle_positions(
            self._settings.GRT_VEHICLE_POSITIONS_URL,
            allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
        )
        for vehicle in grt_vehicles:
            vehicle["transport_type"] = "bus"
        vehicles.extend(grt_vehicles)

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
            except Exception:
                logger.exception("Failed to fetch LRT vehicle positions")

        if self._settings.GRT_TRIP_UPDATES_URL:
            try:
                trip_updates = await gtfs_realtime.fetch_trip_updates(
                    self._settings.GRT_TRIP_UPDATES_URL,
                    allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                )
                for update in trip_updates:
                    update["transport_type"] = "bus"
            except Exception:
                logger.exception("Failed to fetch GTFS-realtime trip updates")

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

        # Static data changes infrequently; only fetch once per process.
        if not self._routes or not self._stops:
            bundle = await gtfs_static.fetch_static_bundle(
                self._settings.GRT_GTFS_STATIC_URL,
                allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
            )
            routes = bundle.get("routes", {})
            stops = bundle.get("stops", {})

            # Fetch LRT static data if configured
            if self._settings.LRT_GTFS_STATIC_URL:
                try:
                    lrt_bundle = await gtfs_static.fetch_static_bundle(
                        self._settings.LRT_GTFS_STATIC_URL,
                        allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                    )
                    lrt_routes = lrt_bundle.get("routes", {})
                    lrt_stops = lrt_bundle.get("stops", {})
                    routes.update(lrt_routes)
                    stops.update(lrt_stops)
                except Exception:
                    logger.exception("Failed to fetch LRT static data")

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
        RADIUS_EARTH_M = 6_371_000.0
        lat_r = math.radians(lat)
        lon_r = math.radians(lon)

        scored: list[tuple[float, Dict[str, Any]]] = []
        async with self._lock:
            for stop_id, info in self._stops.items():
                s_lat = info.get("stop_lat")
                s_lon = info.get("stop_lon")
                if not (isinstance(s_lat, (int, float)) and isinstance(s_lon, (int, float))):
                    continue
                s_lat_r = math.radians(float(s_lat))
                s_lon_r = math.radians(float(s_lon))
                dlat = s_lat_r - lat_r
                dlon = s_lon_r - lon_r
                a = (
                    math.sin(dlat / 2) ** 2
                    + math.cos(lat_r) * math.cos(s_lat_r) * math.sin(dlon / 2) ** 2
                )
                dist = RADIUS_EARTH_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                if dist <= radius_m:
                    scored.append((dist, {**info, "stop_id": stop_id, "distance_m": round(dist, 1)}))

        scored.sort(key=lambda t: t[0])
        return [item for _, item in scored[:limit]]

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
            update = next(
                (item for item in self._trip_updates if item.get("trip_id") == trip_id),
                None,
            )
            if update is None:
                return None

            stops_index = self._stops
            enriched_stops = []
            for stop_update in update.get("stop_time_updates", []):
                stop_id = stop_update.get("stop_id")
                entry = dict(stop_update)
                if stop_id:
                    info = stops_index.get(stop_id, {})
                    entry["stop_name"] = info.get("stop_name")
                    entry["stop_lat"] = info.get("stop_lat")
                    entry["stop_lon"] = info.get("stop_lon")
                enriched_stops.append(entry)

            result = dict(update)
            result["stop_time_updates"] = enriched_stops
            return result

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
