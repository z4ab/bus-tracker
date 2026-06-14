import io
import zipfile

from services.gtfs_static import parse_gtfs_static_bundle, parse_gtfs_static_zip


def _build_zip() -> bytes:
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
    return buffer.getvalue()


def _build_zip_with_stop_times() -> bytes:
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
            "trip-1,08:00:00,08:00:00,stop-1,1\n"
            "trip-1,08:15:00,08:16:00,stop-2,2\n",
        )
    return buffer.getvalue()


def test_parse_gtfs_static_zip_builds_route_map() -> None:
    routes = parse_gtfs_static_zip(_build_zip())

    assert "1" in routes
    assert routes["1"]["route_short_name"] == "1"
    assert routes["1"]["route_color"] == "#FF0000"
    assert len(routes["1"]["shape"]) == 2


def test_parse_gtfs_static_bundle_includes_stop_times() -> None:
    bundle = parse_gtfs_static_bundle(_build_zip_with_stop_times())

    assert "stop_times" in bundle
    assert "trip-1" in bundle["stop_times"]
    assert len(bundle["stop_times"]["trip-1"]) == 2

    st0 = bundle["stop_times"]["trip-1"][0]
    assert st0["stop_id"] == "stop-1"
    assert st0["stop_sequence"] == 1
    assert st0["arrival_time"] == "08:00:00"
    assert st0["departure_time"] == "08:00:00"

    st1 = bundle["stop_times"]["trip-1"][1]
    assert st1["stop_id"] == "stop-2"
    assert st1["stop_sequence"] == 2
    assert st1["arrival_time"] == "08:15:00"
    assert st1["departure_time"] == "08:16:00"


def test_parse_static_bundle_missing_stop_times() -> None:
    """Bundle without stop_times.txt should still work with empty stop_times."""
    bundle = parse_gtfs_static_bundle(_build_zip())

    assert "stop_times" in bundle
    assert bundle["stop_times"] == {}
