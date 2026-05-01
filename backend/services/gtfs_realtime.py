"""Helpers for fetching and parsing GTFS-realtime vehicle positions."""

import logging
from typing import Any, Dict, List, Optional

from google.transit import gtfs_realtime_pb2

from services.http_client import create_async_client

logger = logging.getLogger(__name__)


def _extract_vehicle_id(
    entity: gtfs_realtime_pb2.FeedEntity,
    vehicle: gtfs_realtime_pb2.VehiclePosition,
) -> Optional[str]:
    """Best-effort extraction of a stable vehicle identifier."""
    # Prefer explicit vehicle.id, then fall back to entity.id or vehicle label.
    if vehicle.HasField("vehicle") and vehicle.vehicle.id:
        return vehicle.vehicle.id
    if entity.id:
        return entity.id
    if vehicle.HasField("vehicle") and vehicle.vehicle.label:
        return vehicle.vehicle.label
    return None


def parse_vehicle_positions(
    feed_message: gtfs_realtime_pb2.FeedMessage,
) -> List[Dict[str, Any]]:
    """Convert a GTFS-realtime feed into a list of vehicle dictionaries."""
    vehicles: List[Dict[str, Any]] = []

    for entity in feed_message.entity:
        if not entity.HasField("vehicle"):
            continue
        vehicle = entity.vehicle
        trip = vehicle.trip if vehicle.HasField("trip") else None
        position = vehicle.position if vehicle.HasField("position") else None

        vehicle_id = _extract_vehicle_id(entity, vehicle)
        trip_id = trip.trip_id if trip and trip.trip_id else None
        route_id = trip.route_id if trip and trip.route_id else None

        # GTFS-RT position fields are optional, so guard access accordingly.
        latitude = None
        longitude = None
        bearing = None
        speed = None

        if position is not None:
            if position.HasField("latitude"):
                latitude = position.latitude
            if position.HasField("longitude"):
                longitude = position.longitude
            if position.HasField("bearing"):
                bearing = position.bearing
            if position.HasField("speed"):
                speed = position.speed

        # Timestamp is seconds since epoch if provided by the feed.
        timestamp = vehicle.timestamp if vehicle.HasField("timestamp") else None

        vehicles.append(
            {
                "vehicle_id": vehicle_id,
                "trip_id": trip_id,
                "route_id": route_id,
                "latitude": latitude,
                "longitude": longitude,
                "bearing": bearing,
                "speed": speed,
                "timestamp": timestamp,
            }
        )

    return vehicles


async def fetch_vehicle_positions(
    url: str,
    timeout_s: float = 10.0,
    allow_weak_tls: bool = False,
) -> List[Dict[str, Any]]:
    """Fetch a GTFS-realtime feed and return parsed vehicle positions."""
    if not url:
        raise ValueError("Vehicle positions URL is required")

    try:
        async with create_async_client(timeout_s, allow_weak_tls) as client:
            response = await client.get(url)
            response.raise_for_status()
    except Exception:
        logger.exception("Failed to fetch GTFS-realtime vehicle positions from %s", url)
        raise

    feed = gtfs_realtime_pb2.FeedMessage()
    try:
        feed.ParseFromString(response.content)
    except Exception:
        logger.exception("Failed to parse GTFS-realtime feed from %s", url)
        raise

    return parse_vehicle_positions(feed)
