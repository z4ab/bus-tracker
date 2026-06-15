"""SQLite persistence layer for GTFS static data.

Caches parsed routes and stops in a local SQLite database so the app can
start quickly without re-downloading the GTFS static zip on every restart.
Uses aiosqlite for async access.
"""

import json
import logging
import os
import time
from typing import Any, Dict, Optional

import aiosqlite

logger = logging.getLogger(__name__)

DEFAULT_CACHE_DIR = os.path.expanduser("~/.cache/bus-tracker")
CACHE_DB_FILENAME = "gtfs_static_cache.db"

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS static_cache (
    feed_url TEXT PRIMARY KEY,
    last_modified TEXT,
    etag TEXT,
    routes TEXT NOT NULL,
    stops TEXT NOT NULL,
    stop_times TEXT NOT NULL DEFAULT '{}',
    trip_routes TEXT NOT NULL DEFAULT '{}',
    cached_at REAL NOT NULL
);
"""

_MIGRATIONS = [
    "ALTER TABLE static_cache ADD COLUMN stop_times TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE static_cache ADD COLUMN trip_routes TEXT NOT NULL DEFAULT '{}'",
]


def _get_db_path(cache_dir: Optional[str] = None) -> str:
    base = cache_dir or os.environ.get("GTFS_CACHE_DIR") or DEFAULT_CACHE_DIR
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, CACHE_DB_FILENAME)


async def _get_connection(db_path: str) -> aiosqlite.Connection:
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute(_SCHEMA_SQL)
    for migration in _MIGRATIONS:
        try:
            await conn.execute(migration)
        except Exception:
            pass
    await conn.commit()
    return conn


async def load_cached_static(
    feed_url: str,
    db_path: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    try:
        conn = await _get_connection(db_path or _get_db_path())
        try:
            cursor = await conn.execute(
                "SELECT last_modified, etag, routes, stops, stop_times, trip_routes FROM static_cache WHERE feed_url = ?",
                (feed_url,),
            )
            row = await cursor.fetchone()
            if row is None:
                return None

            return {
                "routes": json.loads(row["routes"]),
                "stops": json.loads(row["stops"]),
                "stop_times": json.loads(row["stop_times"]),
                "trip_routes": json.loads(row["trip_routes"]),
                "last_modified": row["last_modified"],
                "etag": row["etag"],
            }
        finally:
            await conn.close()
    except Exception:
        logger.exception("Failed to load cached static data for %s", feed_url)
        return None


async def save_cached_static(
    feed_url: str,
    routes: Dict[str, Any],
    stops: Dict[str, Any],
    stop_times: Optional[Dict[str, Any]] = None,
    trip_routes: Optional[Dict[str, Any]] = None,
    last_modified: Optional[str] = None,
    etag: Optional[str] = None,
    db_path: Optional[str] = None,
) -> bool:
    try:
        conn = await _get_connection(db_path or _get_db_path())
        try:
            await conn.execute(
                """INSERT INTO static_cache (feed_url, last_modified, etag, routes, stops, stop_times, trip_routes, cached_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(feed_url) DO UPDATE SET
                       last_modified = excluded.last_modified,
                       etag = excluded.etag,
                       routes = excluded.routes,
                       stops = excluded.stops,
                       stop_times = excluded.stop_times,
                       trip_routes = excluded.trip_routes,
                       cached_at = excluded.cached_at""",
                (
                    feed_url,
                    last_modified,
                    etag,
                    json.dumps(routes),
                    json.dumps(stops),
                    json.dumps(stop_times or {}),
                    json.dumps(trip_routes or {}),
                    time.time(),
                ),
            )
            await conn.commit()
            return True
        finally:
            await conn.close()
    except Exception:
        logger.exception("Failed to cache static data for %s", feed_url)
        return False


async def clear_cache(
    feed_url: Optional[str] = None, db_path: Optional[str] = None
) -> bool:
    try:
        conn = await _get_connection(db_path or _get_db_path())
        try:
            if feed_url:
                await conn.execute(
                    "DELETE FROM static_cache WHERE feed_url = ?", (feed_url,)
                )
            else:
                await conn.execute("DELETE FROM static_cache")
            await conn.commit()
            return True
        finally:
            await conn.close()
    except Exception:
        logger.exception("Failed to clear static cache")
        return False
