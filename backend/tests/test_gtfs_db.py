"""Tests for the SQLite static data cache layer (services/gtfs_db.py)."""

import json
import tempfile

import pytest

from services.gtfs_db import save_cached_static, load_cached_static, clear_cache


@pytest.fixture
def db_path():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    yield path
    import os

    os.unlink(path)


SAMPLE_ROUTES = {
    "1": {"route_id": "1", "route_short_name": "101", "route_color": "#FF0000"},
    "2": {"route_id": "2", "route_short_name": "202", "route_color": "#00FF00"},
}

SAMPLE_STOPS = {
    "A": {
        "stop_id": "A",
        "stop_name": "Station A",
        "stop_lat": 43.45,
        "stop_lon": -80.49,
    },
    "B": {
        "stop_id": "B",
        "stop_name": "Station B",
        "stop_lat": 43.46,
        "stop_lon": -80.50,
    },
}

SAMPLE_STOP_TIMES = {
    "trip-1": [
        {"stop_id": "A", "stop_sequence": 1, "arrival_time": "08:00:00", "departure_time": "08:05:00"},
    ],
}

SAMPLE_TRIP_ROUTES = {
    "trip-1": "1",
}

LAST_MODIFIED = "Mon, 01 Jun 2026 12:00:00 GMT"
ETAG = '"abc123"'


@pytest.mark.asyncio
async def test_save_and_load(db_path):
    """Save data, then load it. Verify all fields match."""
    feed_url = "https://example.com/gtfs.zip"

    saved = await save_cached_static(
        feed_url,
        SAMPLE_ROUTES,
        SAMPLE_STOPS,
        stop_times=SAMPLE_STOP_TIMES,
        trip_routes=SAMPLE_TRIP_ROUTES,
        last_modified=LAST_MODIFIED,
        etag=ETAG,
        db_path=db_path,
    )
    assert saved is True

    result = await load_cached_static(feed_url, db_path=db_path)
    assert result is not None

    assert result["routes"] == SAMPLE_ROUTES
    assert result["stops"] == SAMPLE_STOPS
    assert result["stop_times"] == SAMPLE_STOP_TIMES
    assert result["trip_routes"] == SAMPLE_TRIP_ROUTES
    assert result["last_modified"] == LAST_MODIFIED
    assert result["etag"] == ETAG


@pytest.mark.asyncio
async def test_load_missing_url(db_path):
    """Load a feed URL that was never saved. Assert result is None."""
    result = await load_cached_static("https://example.com/never-saved.zip", db_path=db_path)
    assert result is None


@pytest.mark.asyncio
async def test_save_updates_existing(db_path):
    """Save data with URL X, save again with same URL but different data, load
    it back. Verify it returns the updated data, not the old data."""
    feed_url = "https://example.com/gtfs.zip"

    # Save initial data.
    await save_cached_static(
        feed_url,
        {"r1": {"route_id": "r1", "route_short_name": "OLD"}},
        {"s1": {"stop_id": "s1", "stop_name": "Old Stop"}},
        db_path=db_path,
    )

    # Save updated data with the same URL.
    await save_cached_static(
        feed_url,
        {"r2": {"route_id": "r2", "route_short_name": "NEW"}},
        {"s2": {"stop_id": "s2", "stop_name": "New Stop"}},
        db_path=db_path,
    )

    result = await load_cached_static(feed_url, db_path=db_path)
    assert result is not None
    assert result["routes"] == {"r2": {"route_id": "r2", "route_short_name": "NEW"}}
    assert result["stops"] == {"s2": {"stop_id": "s2", "stop_name": "New Stop"}}


@pytest.mark.asyncio
async def test_save_with_empty_dicts(db_path):
    """Save with empty routes={} and stops={}. Load and verify they come back
    as empty dicts."""
    feed_url = "https://example.com/gtfs.zip"

    await save_cached_static(feed_url, {}, {}, db_path=db_path)

    result = await load_cached_static(feed_url, db_path=db_path)
    assert result is not None
    assert result["routes"] == {}
    assert result["stops"] == {}


@pytest.mark.asyncio
async def test_save_without_optional_fields(db_path):
    """Save with no stop_times, trip_routes, last_modified, or etag. Load and
    verify stop_times and trip_routes are empty dicts {}, last_modified and
    etag are None."""
    feed_url = "https://example.com/gtfs.zip"

    await save_cached_static(feed_url, SAMPLE_ROUTES, SAMPLE_STOPS, db_path=db_path)

    result = await load_cached_static(feed_url, db_path=db_path)
    assert result is not None
    assert result["routes"] == SAMPLE_ROUTES
    assert result["stops"] == SAMPLE_STOPS
    assert result["stop_times"] == {}
    assert result["trip_routes"] == {}
    assert result["last_modified"] is None
    assert result["etag"] is None


@pytest.mark.asyncio
async def test_clear_cache_all(db_path):
    """Save two URLs, call clear_cache() with no feed_url argument. Load both
    — both should return None."""
    await save_cached_static("url1", {"r": {"id": "r"}}, {"s": {"id": "s"}}, db_path=db_path)
    await save_cached_static("url2", {"r": {"id": "r"}}, {"s": {"id": "s"}}, db_path=db_path)

    cleared = await clear_cache(db_path=db_path)
    assert cleared is True

    assert await load_cached_static("url1", db_path=db_path) is None
    assert await load_cached_static("url2", db_path=db_path) is None


@pytest.mark.asyncio
async def test_clear_cache_single(db_path):
    """Save two URLs, call clear_cache(feed_url="url1"). "url1" should return
    None, "url2" should still return data."""
    await save_cached_static("url1", {"r": {"id": "r"}}, {"s": {"id": "s"}}, db_path=db_path)
    await save_cached_static("url2", {"r": {"id": "r"}}, {"s": {"id": "s"}}, db_path=db_path)

    cleared = await clear_cache(feed_url="url1", db_path=db_path)
    assert cleared is True

    assert await load_cached_static("url1", db_path=db_path) is None
    assert await load_cached_static("url2", db_path=db_path) is not None


@pytest.mark.asyncio
async def test_load_nonexistent_db():
    """Call load_cached_static with a path in a directory that doesn't exist.
    The function should return None gracefully (catches exceptions internally)."""
    result = await load_cached_static(
        "url", db_path="/nonexistent/dir/cache.db"
    )
    assert result is None
