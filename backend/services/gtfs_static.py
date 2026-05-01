"""Helpers for fetching and parsing GTFS static schedule data."""

import csv
import io
import logging
import zipfile
from typing import Any, Dict, List, Optional

from services.http_client import create_async_client

logger = logging.getLogger(__name__)


def _get_member_name(zf: zipfile.ZipFile, filename: str) -> Optional[str]:
    """Find a case-insensitive filename inside the GTFS zip archive."""
    target = filename.lower()
    for name in zf.namelist():
        if name.lower() == target:
            return name
    return None


def _read_csv_bytes(data: bytes) -> List[Dict[str, str]]:
    """Decode UTF-8 CSV bytes into a list of row dictionaries."""
    text = io.TextIOWrapper(io.BytesIO(data), encoding="utf-8-sig")
    reader = csv.DictReader(text)
    return [row for row in reader]


def _parse_routes(routes_bytes: bytes) -> Dict[str, Dict[str, Any]]:
    """Parse routes.txt into a route metadata dictionary."""
    routes: Dict[str, Dict[str, Any]] = {}
    for row in _read_csv_bytes(routes_bytes):
        route_id = row.get("route_id")
        if not route_id:
            continue
        route_short_name = row.get("route_short_name") or row.get("route_long_name")
        route_color = row.get("route_color") or None
        # Normalize colors to CSS-friendly hex strings if present.
        if route_color and not route_color.startswith("#"):
            route_color = f"#{route_color}"

        routes[route_id] = {
            "route_id": route_id,
            "route_short_name": route_short_name,
            "route_color": route_color,
        }

    return routes


def _parse_trips(trips_bytes: bytes) -> Dict[str, str]:
    """Extract a representative shape_id for each route_id."""
    route_shapes: Dict[str, str] = {}
    for row in _read_csv_bytes(trips_bytes):
        route_id = row.get("route_id")
        shape_id = row.get("shape_id")
        if not route_id or not shape_id:
            continue
        if route_id not in route_shapes:
            route_shapes[route_id] = shape_id
    return route_shapes


def _parse_shapes(shapes_bytes: bytes) -> Dict[str, List[Dict[str, Any]]]:
    """Parse shapes.txt into ordered polyline point lists."""
    shapes: Dict[str, List[Dict[str, Any]]] = {}
    for row in _read_csv_bytes(shapes_bytes):
        shape_id = row.get("shape_id")
        lat = row.get("shape_pt_lat")
        lon = row.get("shape_pt_lon")
        seq = row.get("shape_pt_sequence")
        if not shape_id or lat is None or lon is None or seq is None:
            continue
        try:
            point = {
                "lat": float(lat),
                "lon": float(lon),
                "sequence": int(seq),
            }
        except ValueError:
            continue
        shapes.setdefault(shape_id, []).append(point)

    # Ensure points are in the correct drawing order.
    for shape_id, points in shapes.items():
        points.sort(key=lambda item: item["sequence"])
        shapes[shape_id] = points

    return shapes


def parse_gtfs_static_zip(zip_bytes: bytes) -> Dict[str, Dict[str, Any]]:
    """Parse a GTFS zip file and return route metadata keyed by route_id."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        routes_name = _get_member_name(zf, "routes.txt")
        if not routes_name:
            raise RuntimeError("GTFS static feed is missing routes.txt")

        routes = _parse_routes(zf.read(routes_name))

        trips_name = _get_member_name(zf, "trips.txt")
        shapes_name = _get_member_name(zf, "shapes.txt")
        if trips_name and shapes_name:
            route_shapes = _parse_trips(zf.read(trips_name))
            shapes = _parse_shapes(zf.read(shapes_name))
            for route_id, shape_id in route_shapes.items():
                if route_id in routes and shape_id in shapes:
                    routes[route_id]["shape"] = shapes[shape_id]

        return routes


async def fetch_static_routes(
    url: str,
    timeout_s: float = 20.0,
    allow_weak_tls: bool = False,
) -> Dict[str, Dict[str, Any]]:
    """Fetch the GTFS static feed and return parsed routes."""
    if not url:
        raise ValueError("GTFS static URL is required")

    try:
        async with create_async_client(timeout_s, allow_weak_tls) as client:
            response = await client.get(url)
            response.raise_for_status()
    except Exception:
        logger.exception("Failed to fetch GTFS static feed from %s", url)
        raise

    try:
        return parse_gtfs_static_zip(response.content)
    except Exception:
        logger.exception("Failed to parse GTFS static feed from %s", url)
        raise
