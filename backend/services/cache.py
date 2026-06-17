"""In-memory cache with background refresh for GTFS data."""

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.config import Settings, load_settings
from services import gtfs_alerts, gtfs_realtime, gtfs_static
from services.departure_query import DepartureQuery
from services.geo_query import GeoQuery

logger = logging.getLogger(__name__)


class Cache:
    """Cache for vehicle positions and static route metadata."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._vehicles: List[Dict[str, Any]] = []
        self._routes: Dict[str, Dict[str, Any]] = {}
        self._stops: Dict[str, Dict[str, Any]] = {}
        self._stop_times: Dict[str, List[Dict[str, Any]]] = {}
        self._trip_routes: Dict[str, str] = {}
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
        self._alerts: List[Dict[str, Any]] = []
        self._vehicle_history: dict[str, list[dict]] = {}

    def _compute_bearing(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> Optional[float]:
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
        vehicles: List[Dict[str, Any]] = []
        routes: Dict[str, Dict[str, Any]] = {}
        stops: Dict[str, Dict[str, Any]] = {}
        stop_times: Dict[str, List[Dict[str, Any]]] = {}
        trip_routes: Dict[str, str] = {}
        trip_updates: Optional[List[Dict[str, Any]]] = None
        any_failure = False

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

        if self._settings.GRT_ALERTS_URL:
            try:
                self._alerts = await gtfs_alerts.fetch_alerts(
                    self._settings.GRT_ALERTS_URL,
                    allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                )
                self._feed_health["grt_alerts"] = "ok"
            except Exception:
                logger.exception("Failed to fetch GTFS-realtime alerts")
                self._feed_health["grt_alerts"] = "error"

        if not self._routes or not self._stops:
            try:
                bundle = await gtfs_static.fetch_static_bundle_cached(
                    self._settings.GRT_GTFS_STATIC_URL,
                    allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                )
                routes = bundle.get("routes", {})
                stops = bundle.get("stops", {})
                stop_times = bundle.get("stop_times", {})
                trip_routes = bundle.get("trip_routes", {})
                self._feed_health["grt_static"] = "ok"
            except Exception:
                logger.exception("Failed to fetch GRT static data")
                self._feed_health["grt_static"] = "error"
                any_failure = True

            if self._settings.LRT_GTFS_STATIC_URL:
                try:
                    lrt_bundle = await gtfs_static.fetch_static_bundle_cached(
                        self._settings.LRT_GTFS_STATIC_URL,
                        allow_weak_tls=self._settings.GRT_ALLOW_WEAK_TLS,
                    )
                    lrt_routes = lrt_bundle.get("routes", {})
                    lrt_stops = lrt_bundle.get("stops", {})
                    lrt_stop_times = lrt_bundle.get("stop_times", {})
                    lrt_trip_routes = lrt_bundle.get("trip_routes", {})
                    routes.update(lrt_routes)
                    stops.update(lrt_stops)
                    stop_times.update(lrt_stop_times)
                    trip_routes.update(lrt_trip_routes)
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
            if stop_times:
                self._stop_times = stop_times
            if trip_routes:
                self._trip_routes = trip_routes
            self._last_updated = timestamp
            self._last_updated_at = now
            if any_failure:
                self._refresh_failed = True
                self._refresh_error = "One or more GTFS feeds failed to refresh"
            else:
                # Append current positions to vehicle history
                now_ts = int(now.timestamp())
                for vehicle in self._vehicles:
                    vid = vehicle.get("vehicle_id")
                    if not vid:
                        continue
                    entry = {
                        "latitude": vehicle.get("latitude"),
                        "longitude": vehicle.get("longitude"),
                        "bearing": vehicle.get("bearing"),
                        "timestamp": now_ts,
                    }
                    history = self._vehicle_history.setdefault(vid, [])
                    history.append(entry)
                    # Keep max 60 entries per vehicle
                    if len(history) > 60:
                        history[:] = history[-60:]

                self._refresh_failed = False
                self._refresh_error = None

    async def _run(self) -> None:
        while True:
            try:
                await self.refresh_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Cache refresh failed")
            await asyncio.sleep(self._settings.REFRESH_SECONDS)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def get_vehicles(self) -> List[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            return list(self._vehicles)

    async def get_vehicle(self, vehicle_id: str) -> Optional[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            for vehicle in self._vehicles:
                if vehicle.get("vehicle_id") == vehicle_id:
                    return dict(vehicle)
        return None

    async def get_vehicle_history(self, vehicle_id: str) -> List[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            return list(self._vehicle_history.get(vehicle_id, []))

    async def get_routes(self) -> Dict[str, Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            return {route_id: dict(info) for route_id, info in self._routes.items()}

    async def get_stops(self) -> Dict[str, Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            return {stop_id: dict(info) for stop_id, info in self._stops.items()}

    async def search_stops(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            results: List[Dict[str, Any]] = []
            q = query.lower().strip()
            for stop_id, info in self._stops.items():
                name = (info.get("stop_name") or "").lower()
                if q in name:
                    entry = dict(info)
                    entry["stop_id"] = stop_id
                    entry["distance_m"] = None  # no reference point
                    results.append(entry)
            results.sort(key=lambda s: s.get("stop_name") or "")
            return results[:limit]

    async def get_nearby_stops(
        self, lat: float, lon: float, radius_m: float = 500.0, limit: int = 20
    ) -> List[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            stops_snapshot = {sid: dict(info) for sid, info in self._stops.items()}
        return self._geo.nearby_stops(stops_snapshot, lat, lon, radius_m, limit)

    async def get_alerts(self) -> List[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            return [dict(alert) for alert in self._alerts]

    async def get_trip_updates(self) -> List[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            return [dict(update) for update in self._trip_updates]

    async def get_trip_details(self, trip_id: str) -> Optional[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            trip_updates_snapshot = [dict(u) for u in self._trip_updates]
            stops_snapshot = {sid: dict(info) for sid, info in self._stops.items()}
        return self._departure.get_trip_details(
            trip_updates_snapshot, stops_snapshot, trip_id
        )

    async def get_stop_departures(
        self,
        stop_id: str,
        limit: int = 10,
        route_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        await self.ensure_fresh()
        async with self._lock:
            trip_updates_snapshot = [dict(u) for u in self._trip_updates]
            stops_snapshot = {sid: dict(info) for sid, info in self._stops.items()}
            stop_times_snapshot = {
                tid: list(entries) for tid, entries in self._stop_times.items()
            }
            trip_routes_snapshot = dict(self._trip_routes)
            routes_snapshot = {rid: dict(info) for rid, info in self._routes.items()}
        return self._departure.get_stop_departures(
            stop_id,
            trip_updates_snapshot,
            stops_snapshot,
            stop_times_snapshot,
            trip_routes_snapshot,
            routes_snapshot,
            limit=limit,
            route_id=route_id,
        )

    async def get_last_updated(self) -> Optional[str]:
        async with self._lock:
            return self._last_updated

    async def get_cache_sizes(self) -> Dict[str, int]:
        async with self._lock:
            return {
                "vehicles": len(self._vehicles),
                "routes": len(self._routes),
                "stops": len(self._stops),
                "stop_times": len(self._stop_times),
                "trip_routes": len(self._trip_routes),
                "trip_updates": len(self._trip_updates),
                "alerts": len(self._alerts),
            }

    async def get_feed_health(self) -> Dict[str, str]:
        async with self._lock:
            return dict(self._feed_health)

    async def get_cache_status(self) -> Dict[str, Any]:
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
    global _cache
    if _cache is None:
        _cache = Cache(load_settings())
    return _cache
