"""Tests for the cached GTFS static fetching (fetch_static_bundle_cached et al.)."""

import io
import tempfile
import zipfile

import httpx
import pytest

from services.gtfs_static import (
    _head_for_headers,
    fetch_static_bundle_cached,
    parse_gtfs_static_bundle,
)


def _build_zip_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr(
            "routes.txt",
            "route_id,route_short_name,route_color\n1,1,FF0000\n",
        )
        zf.writestr(
            "trips.txt",
            "route_id,service_id,trip_id,shape_id\n1,svc,trip-1,shapeA\n",
        )
        zf.writestr(
            "shapes.txt",
            "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n"
            "shapeA,43.1,-80.1,1\n"
            "shapeA,43.2,-80.2,2\n",
        )
        zf.writestr(
            "stop_times.txt",
            "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
            "trip-1,08:00:00,08:00:00,stop-1,1\n",
        )
    return buffer.getvalue()


@pytest.fixture
def db_path():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    yield path
    import os

    os.unlink(path)


@pytest.fixture
def mock_create_client(monkeypatch):
    """Monkeypatch create_async_client to return fresh clients with a given transport."""

    def _patch(handler):
        clients_used = []

        def factory(timeout, weak_tls):
            transport = httpx.MockTransport(handler)
            client = httpx.AsyncClient(transport=transport)
            clients_used.append(client)
            return client

        monkeypatch.setattr("services.gtfs_static.create_async_client", factory)
        # Also patch it in http_client (where it lives) so the import-through works.
        monkeypatch.setattr("services.http_client.create_async_client", factory)
        return clients_used

    return _patch


@pytest.mark.asyncio
async def test_fetch_static_bundle_cached_cache_hit(db_path, mock_create_client):
    """On cache hit (Last-Modified unchanged), no full GET is made."""
    feed_url = "https://example.com/gtfs.zip"
    zip_data = _build_zip_bytes()
    last_modified = "Mon, 01 Jun 2026 12:00:00 GMT"

    # Pre-populate the DB.
    bundle = parse_gtfs_static_bundle(zip_data)
    from services.gtfs_db import save_cached_static

    await save_cached_static(
        feed_url,
        bundle["routes"],
        bundle["stops"],
        last_modified=last_modified,
        db_path=db_path,
        stop_times=bundle.get("stop_times", {}),
    )

    head_count = 0
    get_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal head_count, get_count
        if request.method == "HEAD":
            head_count += 1
            return httpx.Response(200, headers={"Last-Modified": last_modified})
        elif request.method == "GET":
            get_count += 1
            return httpx.Response(200, content=zip_data)
        return httpx.Response(405)

    mock_create_client(handler)

    result = await fetch_static_bundle_cached(feed_url, db_path=db_path)

    assert head_count == 1
    assert get_count == 0  # no full download — cache hit
    assert "1" in result["routes"]
    assert result["routes"]["1"]["route_color"] == "#FF0000"
    assert "trip-1" in result["stop_times"]
    assert len(result["stop_times"]["trip-1"]) == 1
    assert result["stop_times"]["trip-1"][0]["stop_id"] == "stop-1"


@pytest.mark.asyncio
async def test_fetch_static_bundle_cached_cache_miss(db_path, mock_create_client):
    """On cache miss (no DB entry), fetches full zip and persists."""
    feed_url = "https://example.com/gtfs.zip"
    zip_data = _build_zip_bytes()
    last_modified = "Mon, 01 Jun 2026 12:00:00 GMT"

    head_count = 0
    get_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal head_count, get_count
        if request.method == "HEAD":
            head_count += 1
            return httpx.Response(200, headers={"Last-Modified": last_modified})
        elif request.method == "GET":
            get_count += 1
            return httpx.Response(200, content=zip_data)
        return httpx.Response(405)

    mock_create_client(handler)

    result = await fetch_static_bundle_cached(feed_url, db_path=db_path)

    assert head_count == 1
    assert get_count == 1  # full download because cache was empty
    assert "1" in result["routes"]

    # Verify it was persisted.
    from services.gtfs_db import load_cached_static

    cached = await load_cached_static(feed_url, db_path=db_path)
    assert cached is not None
    assert cached["last_modified"] == last_modified
    assert "trip-1" in cached["stop_times"]
    assert cached["stop_times"]["trip-1"][0]["stop_id"] == "stop-1"


@pytest.mark.asyncio
async def test_fetch_static_bundle_cached_head_fails(db_path, mock_create_client):
    """If HEAD fails, fall through to a full GET (no crash)."""
    feed_url = "https://example.com/gtfs.zip"
    zip_data = _build_zip_bytes()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "HEAD":
            return httpx.Response(500)
        elif request.method == "GET":
            return httpx.Response(200, content=zip_data)
        return httpx.Response(405)

    mock_create_client(handler)

    result = await fetch_static_bundle_cached(feed_url, db_path=db_path)

    assert "1" in result["routes"]
    assert "stop_times" in result


@pytest.mark.asyncio
async def test_head_for_headers_extracts_headers(mock_create_client):
    feed_url = "https://example.com/gtfs.zip"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={
                "Last-Modified": "Mon, 01 Jun 2026 12:00:00 GMT",
                "ETag": '"abc"',
            },
        )

    mock_create_client(handler)

    headers = await _head_for_headers(feed_url)

    assert headers["last_modified"] == "Mon, 01 Jun 2026 12:00:00 GMT"
    assert headers["etag"] == '"abc"'


@pytest.mark.asyncio
async def test_head_for_headers_error_returns_empty(mock_create_client):
    feed_url = "https://example.com/gtfs.zip"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    mock_create_client(handler)

    headers = await _head_for_headers(feed_url)

    assert headers == {}
