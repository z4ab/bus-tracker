"""Departure query utilities for GTFS trip-update enrichment."""

from typing import Any, Dict, List, Optional


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
