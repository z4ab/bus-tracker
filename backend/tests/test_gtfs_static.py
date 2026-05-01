import io
import zipfile

from services.gtfs_static import parse_gtfs_static_zip


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


def test_parse_gtfs_static_zip_builds_route_map() -> None:
    routes = parse_gtfs_static_zip(_build_zip())

    assert "1" in routes
    assert routes["1"]["route_short_name"] == "1"
    assert routes["1"]["route_color"] == "#FF0000"
    assert len(routes["1"]["shape"]) == 2
