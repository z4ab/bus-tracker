"""Helpers for fetching and parsing GTFS static schedule data."""

import csv
import gzip
import io
import logging
import zipfile
from typing import Any, Dict, List, Optional

import httpx

from services.gtfs_db import load_cached_static, save_cached_static
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
        route_long_name = row.get("route_long_name") or None
        route_short_name = row.get("route_short_name") or route_long_name
        route_color = row.get("route_color") or None
        route_text_color = row.get("route_text_color") or None

        # Normalize colors to CSS-friendly hex strings if present.
        if route_color and not route_color.startswith("#"):
            route_color = f"#{route_color}"
        if route_text_color and not route_text_color.startswith("#"):
            route_text_color = f"#{route_text_color}"

        routes[route_id] = {
            "route_id": route_id,
            "route_short_name": route_short_name,
            "route_long_name": route_long_name,
            "route_color": route_color,
            "route_text_color": route_text_color,
        }

    return routes


def _parse_stops(stops_bytes: bytes) -> Dict[str, Dict[str, Any]]:
    """Parse stops.txt into a stop metadata dictionary."""
    stops: Dict[str, Dict[str, Any]] = {}
    for row in _read_csv_bytes(stops_bytes):
        stop_id = row.get("stop_id")
        if not stop_id:
            continue
        stop_name = row.get("stop_name") or row.get("stop_desc") or None
        lat_raw = row.get("stop_lat")
        lon_raw = row.get("stop_lon")

        stop_lat = None
        stop_lon = None
        if lat_raw not in (None, "") and lon_raw not in (None, ""):
            try:
                stop_lat = float(lat_raw)
                stop_lon = float(lon_raw)
            except ValueError:
                stop_lat = None
                stop_lon = None

        stops[stop_id] = {
            "stop_id": stop_id,
            "stop_name": stop_name,
            "stop_lat": stop_lat,
            "stop_lon": stop_lon,
        }

    return stops


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


def parse_gtfs_static_bundle(zip_bytes: bytes) -> Dict[str, Dict[str, Any]]:
    """Parse a GTFS zip file and return routes and stops metadata.

    If the zip bytes are gzip-encoded (some feeds wrap the zip with
    ``Content-Encoding: gzip``), decompress transparently before parsing.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        logger.debug("Bytes are not a valid zip — trying gzip decompress")
        zip_bytes = gzip.decompress(zip_bytes)
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))

    with zf:
        routes_name = _get_member_name(zf, "routes.txt")
        if not routes_name:
            raise RuntimeError("GTFS static feed is missing routes.txt")

        routes = _parse_routes(zf.read(routes_name))

        stops: Dict[str, Dict[str, Any]] = {}
        stops_name = _get_member_name(zf, "stops.txt")
        if stops_name:
            stops = _parse_stops(zf.read(stops_name))

        trips_name = _get_member_name(zf, "trips.txt")
        shapes_name = _get_member_name(zf, "shapes.txt")
        if trips_name and shapes_name:
            route_shapes = _parse_trips(zf.read(trips_name))
            shapes = _parse_shapes(zf.read(shapes_name))
            for route_id, shape_id in route_shapes.items():
                if route_id in routes and shape_id in shapes:
                    routes[route_id]["shape"] = shapes[shape_id]

        return {"routes": routes, "stops": stops}


def parse_gtfs_static_zip(zip_bytes: bytes) -> Dict[str, Dict[str, Any]]:
    """Parse a GTFS zip file and return route metadata keyed by route_id."""
    return parse_gtfs_static_bundle(zip_bytes)["routes"]


async def fetch_static_bundle(
    url: str,
    timeout_s: float = 20.0,
    allow_weak_tls: bool = False,
) -> Dict[str, Dict[str, Any]]:
    """Fetch the GTFS static feed and return routes and stops metadata."""
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
        return parse_gtfs_static_bundle(response.content)
    except Exception:
        logger.exception("Failed to parse GTFS static feed from %s", url)
        raise


async def fetch_static_routes(
    url: str,
    timeout_s: float = 20.0,
    allow_weak_tls: bool = False,
) -> Dict[str, Dict[str, Any]]:
    """Fetch the GTFS static feed and return parsed routes."""
    bundle = await fetch_static_bundle(
        url, timeout_s=timeout_s, allow_weak_tls=allow_weak_tls
    )
    return bundle["routes"]


async def fetch_static_stops(
    url: str,
    timeout_s: float = 20.0,
    allow_weak_tls: bool = False,
) -> Dict[str, Dict[str, Any]]:
    """Fetch the GTFS static feed and return parsed stops."""
    bundle = await fetch_static_bundle(
        url, timeout_s=timeout_s, allow_weak_tls=allow_weak_tls
    )
    return bundle["stops"]


async def _head_for_headers(
    url: str,
    timeout_s: float = 20.0,
    allow_weak_tls: bool = False,
) -> Dict[str, str]:
    """Send a HEAD request and return selected response headers.

    Returns ``{"last_modified": …, "etag": …}``.  Missing or failed headers
    are returned as ``None``.  If the HEAD request itself fails (network
    error, non-2xx status) an empty dict is returned so the caller falls
    through to a full GET.
    """
    try:
        async with create_async_client(timeout_s, allow_weak_tls) as client:
            response = await client.head(url, follow_redirects=True)
            if response.is_error:
                return {}
            return {
                "last_modified": response.headers.get("last-modified"),
                "etag": response.headers.get("etag"),
            }
    except (httpx.HTTPError, OSError):
        logger.debug("HEAD request failed for %s — will fall through to GET", url)
        return {}


async def fetch_static_bundle_cached(
    url: str,
    timeout_s: float = 20.0,
    allow_weak_tls: bool = False,
    db_path: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """Fetch GTFS static data, preferring SQLite cache when the feed hasn't changed.

    1. Send a lightweight HEAD request to capture ``Last-Modified`` / ``ETag``.
    2. If the SQLite cache has data for *url* whose ``last_modified`` or
       ``etag`` matches the server's, return the cached copy without any
       network download.
    3. Otherwise fetch the full zip, parse it, persist to SQLite, and return.

    Returns ``{"routes": …, "stops": …}``.  On cache write failure the
    parsed data is still returned (the network fetch succeeded); the user
    just loses persistence until the next call.
    """
    if not url:
        raise ValueError("GTFS static URL is required")

    # 1. Lightweight HEAD to check for changes.
    server_headers = await _head_for_headers(url, timeout_s, allow_weak_tls)
    server_lm = server_headers.get("last_modified")
    server_etag = server_headers.get("etag")

    # 2. Try SQLite cache.
    cached = await load_cached_static(url, db_path=db_path)
    if cached is not None:
        cached_lm = cached.get("last_modified")
        cached_etag = cached.get("etag")
        # If the server didn't give us headers, skip the cache (safety).
        if server_lm or server_etag:
            if server_lm and server_lm == cached_lm:
                logger.debug("Cache HIT for %s (Last-Modified unchanged)", url)
                return {"routes": cached["routes"], "stops": cached["stops"]}
            if server_etag and server_etag == cached_etag:
                logger.debug("Cache HIT for %s (ETag unchanged)", url)
                return {"routes": cached["routes"], "stops": cached["stops"]}

    # 3. Cache miss or changed — fetch full bundle.
    logger.info("Fetching GTFS static feed from %s", url)
    async with create_async_client(timeout_s, allow_weak_tls) as client:
        response = await client.get(url)
        response.raise_for_status()
    bundle = parse_gtfs_static_bundle(response.content)

    # 4. Persist to SQLite (best-effort).
    ok = await save_cached_static(
        url,
        bundle["routes"],
        bundle["stops"],
        last_modified=server_lm,
        etag=server_etag,
        db_path=db_path,
    )
    if ok:
        logger.debug("Cached static data for %s", url)
    else:
        logger.warning("Failed to write static data cache for %s", url)

    return bundle
