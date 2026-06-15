"""Departure query utilities for GTFS trip-update enrichment and stop departures."""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional


def _stop_time_to_timestamp(time_str: str, base_date: date) -> int:
    """Convert GTFS stop_time HH:MM:SS to a Unix timestamp.

    Handles hours beyond 23 (late-night trips that wrap past midnight).
    """
    parts = time_str.split(":")
    hours = int(parts[0])
    minutes = int(parts[1]) if len(parts) > 1 else 0
    seconds = int(parts[2]) if len(parts) > 2 else 0
    dt = (
        datetime(
            base_date.year,
            base_date.month,
            base_date.day,
            0,
            0,
            0,
            tzinfo=timezone.utc,
        )
        + timedelta(hours=hours, minutes=minutes, seconds=seconds)
    )
    return int(dt.timestamp())


class DepartureQuery:
    """Helper for querying trip departure details from trip updates + static data."""

    def get_trip_details(
        self,
        trip_updates: List[Dict[str, Any]],
        stops: Dict[str, Dict[str, Any]],
        trip_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Return enriched stop-time details for *trip_id*, or None if not found.

        The returned dict carries all fields from the matching trip update
        (including the stop-time list) with ``stop_name`` / ``stop_lat`` /
        ``stop_lon`` merged into each stop entry.
        """
        update = next(
            (item for item in trip_updates if item.get("trip_id") == trip_id),
            None,
        )
        if update is None:
            return None

        enriched_stops = []
        for stop_update in update.get("stop_time_updates", []):
            stop_id = stop_update.get("stop_id")
            entry = dict(stop_update)
            if stop_id:
                info = stops.get(stop_id, {})
                entry["stop_name"] = info.get("stop_name")
                entry["stop_lat"] = info.get("stop_lat")
                entry["stop_lon"] = info.get("stop_lon")
            enriched_stops.append(entry)

        result = dict(update)
        result["stop_time_updates"] = enriched_stops
        return result

    def get_stop_departures(
        self,
        stop_id: str,
        trip_updates: List[Dict[str, Any]],
        stops: Dict[str, Dict[str, Any]],
        stop_times: Dict[str, List[Dict[str, Any]]],
        trip_routes: Dict[str, str],
        routes: Dict[str, Dict[str, Any]],
        limit: int = 10,
        route_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Return upcoming departures for *stop_id*, mixing real-time and static.

        For each trip serving this stop (from *stop_times*), checks if a
        matching real-time trip update exists.  If yes, uses the predicted
        arrival/departure; otherwise falls back to the static schedule time
        computed to today's date.

        Returns a list of departure dicts sorted by departure time, each
        containing:
            trip_id, route_id, route_short_name, route_color, stop_id,
            arrival_time (int | None), departure_time (int | None),
            type ("predicted" | "scheduled"),
            minutes_away (int | None)
        """
        now = datetime.now(timezone.utc)
        today = now.date()
        now_ts = int(now.timestamp())

        stop_trip_entries: Dict[str, Dict[str, Any]] = {}
        for tid, entries in stop_times.items():
            for entry in entries:
                if entry.get("stop_id") == stop_id:
                    stop_trip_entries[tid] = entry
                    break

        if not stop_trip_entries:
            return []

        trip_updates_by_id: Dict[str, Dict[str, Any]] = {
            u.get("trip_id"): u for u in trip_updates if u.get("trip_id")
        }

        departures: List[Dict[str, Any]] = []

        for tid, stop_entry in stop_trip_entries.items():
            rid = trip_routes.get(tid)
            if not rid:
                continue

            if route_id is not None and rid != route_id:
                continue

            route_info = routes.get(rid, {})
            route_short_name = route_info.get("route_short_name")
            route_color = route_info.get("route_color")

            trip_update = trip_updates_by_id.get(tid)

            if trip_update is not None:
                for stu in trip_update.get("stop_time_updates", []):
                    if stu.get("stop_id") == stop_id:
                        arr = stu.get("arrival_time")
                        dep = stu.get("departure_time")
                        deptype = "predicted"
                        break
                else:
                    continue
            else:
                arr_str = stop_entry.get("arrival_time")
                dep_str = stop_entry.get("departure_time")
                arr = (
                    _stop_time_to_timestamp(arr_str, today)
                    if arr_str
                    else None
                )
                dep = (
                    _stop_time_to_timestamp(dep_str, today)
                    if dep_str
                    else None
                )
                deptype = "scheduled"

            ref = dep if dep is not None else arr
            if ref is None:
                continue

            minutes_away = (ref - now_ts) // 60 if ref is not None else None

            departures.append(
                {
                    "trip_id": tid,
                    "route_id": rid,
                    "route_short_name": route_short_name,
                    "route_color": route_color,
                    "stop_id": stop_id,
                    "arrival_time": arr,
                    "departure_time": dep,
                    "type": deptype,
                    "minutes_away": minutes_away,
                }
            )

        departures.sort(
            key=lambda d: d["departure_time"]
            if d["departure_time"] is not None
            else (d["arrival_time"] or 0)
        )

        return departures[:limit]
