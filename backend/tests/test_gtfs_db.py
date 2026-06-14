import json
import tempfile

import pytest

from services.gtfs_db import (
    clear_cache,
    load_cached_static,
    save_cached_static,
)


@pytest.fixture
def db_path():
    """Yield a temporary SQLite database path and clean up after the test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    yield path
    import os
    os.unlink(path)


@pytest.mark.asyncio
async def test_save_and_load_round_trip(db_path: str) -> None:
    feed_url = "https://example.com/gtfs.zip"
    routes = {"1": {"route_id": "1", "route_short_name": "1", "route_color": "#FF0000"}}
    stops = {
        "S1": {"stop_id": "S1", "stop_name": "Main St", "stop_lat": 43.0, "stop_lon": -80.0},
    }
    last_modified = "Mon, 01 Jun 2026 12:00:00 GMT"

    saved = await save_cached_static(
        feed_url, routes, stops, last_modified=last_modified, db_path=db_path,
    )
    assert saved is True

    loaded = await load_cached_static(feed_url, db_path=db_path)
    assert loaded is not None
    assert loaded["routes"] == routes
    assert loaded["stops"] == stops
    assert loaded["last_modified"] == last_modified
    assert loaded["etag"] is None


@pytest.mark.asyncio
async def test_cache_miss_returns_none(db_path: str) -> None:
    loaded = await load_cached_static("https://example.com/unknown.zip", db_path=db_path)
    assert loaded is None


@pytest.mark.asyncio
async def test_upsert_replaces_existing_entry(db_path: str) -> None:
    feed_url = "https://example.com/gtfs.zip"
    routes_v1 = {"1": {"route_id": "1"}}
    stops_v1: dict = {}

    await save_cached_static(feed_url, routes_v1, stops_v1, last_modified="old", db_path=db_path)

    routes_v2 = {"2": {"route_id": "2"}}
    await save_cached_static(feed_url, routes_v2, stops_v1, last_modified="new", db_path=db_path)

    loaded = await load_cached_static(feed_url, db_path=db_path)
    assert loaded is not None
    assert loaded["last_modified"] == "new"
    assert loaded["routes"] == routes_v2


@pytest.mark.asyncio
async def test_clear_single_url(db_path: str) -> None:
    await save_cached_static(
        "https://example.com/a.zip", {"a": {}}, {}, db_path=db_path,
    )
    await save_cached_static(
        "https://example.com/b.zip", {"b": {}}, {}, db_path=db_path,
    )

    await clear_cache("https://example.com/a.zip", db_path=db_path)

    assert await load_cached_static("https://example.com/a.zip", db_path=db_path) is None
    assert await load_cached_static("https://example.com/b.zip", db_path=db_path) is not None


@pytest.mark.asyncio
async def test_clear_all(db_path: str) -> None:
    await save_cached_static("https://example.com/a.zip", {"a": {}}, {}, db_path=db_path)
    await save_cached_static("https://example.com/b.zip", {"b": {}}, {}, db_path=db_path)

    await clear_cache(db_path=db_path)

    assert await load_cached_static("https://example.com/a.zip", db_path=db_path) is None
    assert await load_cached_static("https://example.com/b.zip", db_path=db_path) is None


@pytest.mark.asyncio
async def test_etag_caching(db_path: str) -> None:
    feed_url = "https://example.com/gtfs.zip"
    routes = {"1": {"route_id": "1"}}
    stops: dict = {}
    etag = '"abc123"'

    await save_cached_static(feed_url, routes, stops, etag=etag, db_path=db_path)
    loaded = await load_cached_static(feed_url, db_path=db_path)

    assert loaded is not None
    assert loaded["etag"] == etag
