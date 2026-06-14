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

# Default cache directory under the user's home.
DEFAULT_CACHE_DIR = os.path.expanduser("~/.cache/bus-tracker")
CACHE_DB_FILENAME = "gtfs_static_cache.db"

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS static_cache (
    feed_url TEXT PRIMARY KEY,
    last_modified TEXT,
    etag TEXT,
    routes TEXT NOT NULL,
    stops TEXT NOT NULL,
    cached_at REAL NOT NULL
);
"""


def _get_db_path(cache_dir: Optional[str] = None) -> str:
    """Return the absolute path to the SQLite cache database."""
    base = cache_dir or os.environ.get("GTFS_CACHE_DIR") or DEFAULT_CACHE_DIR
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, CACHE_DB_FILENAME)


async def _get_connection(db_path: str) -> aiosqlite.Connection:
    """Open (or create) the database and ensure the schema exists."""
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute(_SCHEMA_SQL)
    await conn.commit()
    return conn


async def load_cached_static(
    feed_url: str,
    db_path: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Load cached routes and stops for *feed_url* from SQLite.

    Returns ``{"routes": …, "stops": …, "last_modified": …, "etag": …}``
    if a record exists, or ``None`` on cache miss / any error.
    """
    try:
        conn = await _get_connection(db_path or _get_db_path())
        try:
            cursor = await conn.execute(
                "SELECT last_modified, etag, routes, stops FROM static_cache WHERE feed_url = ?",
                (feed_url,),
            )
            row = await cursor.fetchone()
            if row is None:
                return None

            return {
                "routes": json.loads(row["routes"]),
                "stops": json.loads(row["stops"]),
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
    last_modified: Optional[str] = None,
    etag: Optional[str] = None,
    db_path: Optional[str] = None,
) -> bool:
    """Persist parsed static data to SQLite, keyed by *feed_url*.

    Uses UPSERT so repeated calls are safe.
    Returns ``True`` on success, ``False`` on failure.
    """
    try:
        conn = await _get_connection(db_path or _get_db_path())
        try:
            await conn.execute(
                """INSERT INTO static_cache (feed_url, last_modified, etag, routes, stops, cached_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(feed_url) DO UPDATE SET
                       last_modified = excluded.last_modified,
                       etag = excluded.etag,
                       routes = excluded.routes,
                       stops = excluded.stops,
                       cached_at = excluded.cached_at""",
                (
                    feed_url,
                    last_modified,
                    etag,
                    json.dumps(routes),
                    json.dumps(stops),
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
    """Delete cached entries, optionally for a single *feed_url*."""
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
