from google.transit import gtfs_realtime_pb2

from services.gtfs_realtime import parse_vehicle_positions


def test_parse_vehicle_positions_extracts_fields() -> None:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"

    entity = feed.entity.add()
    entity.id = "entity-1"

    vehicle = entity.vehicle
    vehicle.timestamp = 1710000000
    vehicle.trip.trip_id = "trip-1"
    vehicle.trip.route_id = "route-1"
    vehicle.vehicle.id = "veh-123"
    vehicle.position.latitude = 43.45
    vehicle.position.longitude = -80.52
    vehicle.position.bearing = 90.0
    vehicle.position.speed = 12.3

    vehicles = parse_vehicle_positions(feed)

    assert len(vehicles) == 1
    assert vehicles[0]["vehicle_id"] == "veh-123"
    assert vehicles[0]["trip_id"] == "trip-1"
    assert vehicles[0]["route_id"] == "route-1"
    assert vehicles[0]["latitude"] == 43.45
    assert vehicles[0]["longitude"] == -80.52
    assert vehicles[0]["bearing"] == 90.0
    assert vehicles[0]["speed"] == 12.3
    assert vehicles[0]["timestamp"] == 1710000000
