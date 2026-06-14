"""Geographic query utilities for GTFS stop filtering."""

import math
from typing import Any, Dict, List

RADIUS_EARTH_M = 6_371_000.0


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in metres between two GPS coordinates."""
    lat1_r = math.radians(lat1)
    lon1_r = math.radians(lon1)
    lat2_r = math.radians(lat2)
    lon2_r = math.radians(lon2)

    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    )
    return RADIUS_EARTH_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class GeoQuery:
    """Helper for geographic queries over GTFS stop data."""

    @staticmethod
    def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Return the great-circle distance in metres between two GPS coordinates."""
        return haversine(lat1, lon1, lat2, lon2)

    def nearby_stops(
        self,
        stops: Dict[str, Dict[str, Any]],
        lat: float,
        lon: float,
        radius_m: float = 500.0,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Return stops within *radius_m* of (lat, lon), sorted by distance.

        Each result includes the stop data plus ``stop_id`` and ``distance_m``.
        """
        scored: List[tuple[float, Dict[str, Any]]] = []

        for stop_id, info in stops.items():
            s_lat = info.get("stop_lat")
            s_lon = info.get("stop_lon")
            if not (
                isinstance(s_lat, (int, float)) and isinstance(s_lon, (int, float))
            ):
                continue

            dist = haversine(lat, lon, float(s_lat), float(s_lon))
            if dist <= radius_m:
                scored.append(
                    (
                        dist,
                        {**info, "stop_id": stop_id, "distance_m": round(dist, 1)},
                    )
                )

        scored.sort(key=lambda t: t[0])
        return [item for _, item in scored[:limit]]
