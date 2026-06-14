"""Helpers for fetching and parsing GTFS-realtime vehicle positions and trip updates."""

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


def parse_trip_updates(
    feed_message: gtfs_realtime_pb2.FeedMessage,
) -> List[Dict[str, Any]]:
    """Convert a GTFS-realtime feed into a list of trip update dictionaries."""
    updates: List[Dict[str, Any]] = []

    for entity in feed_message.entity:
        if not entity.HasField("trip_update"):
            continue

        trip_update = entity.trip_update
        trip = trip_update.trip if trip_update.HasField("trip") else None
        if not trip or not trip.trip_id:
            continue

        route_id = trip.route_id if trip.route_id else None
        vehicle_id = None
        if trip_update.HasField("vehicle") and trip_update.vehicle.id:
            vehicle_id = trip_update.vehicle.id

        stop_time_updates: List[Dict[str, Any]] = []
        for stop_time_update in trip_update.stop_time_update:
            stop_id = stop_time_update.stop_id or None
            stop_sequence = (
                stop_time_update.stop_sequence
                if stop_time_update.HasField("stop_sequence")
                else None
            )

            arrival_time = None
            arrival_delay = None
            if stop_time_update.HasField("arrival"):
                arrival = stop_time_update.arrival
                if arrival.HasField("time"):
                    arrival_time = int(arrival.time)
                if arrival.HasField("delay"):
                    arrival_delay = int(arrival.delay)

            departure_time = None
            departure_delay = None
            if stop_time_update.HasField("departure"):
                departure = stop_time_update.departure
                if departure.HasField("time"):
                    departure_time = int(departure.time)
                if departure.HasField("delay"):
                    departure_delay = int(departure.delay)

            stop_time_updates.append(
                {
                    "stop_id": stop_id,
                    "stop_sequence": stop_sequence,
                    "arrival_time": arrival_time,
                    "arrival_delay": arrival_delay,
                    "departure_time": departure_time,
                    "departure_delay": departure_delay,
                }
            )

        updates.append(
            {
                "trip_id": trip.trip_id,
                "route_id": route_id,
                "vehicle_id": vehicle_id,
                "timestamp": (
                    trip_update.timestamp if trip_update.HasField("timestamp") else None
                ),
                "stop_time_updates": stop_time_updates,
            }
        )

    return updates


async def fetch_trip_updates(
    url: str,
    timeout_s: float = 10.0,
    allow_weak_tls: bool = False,
) -> List[Dict[str, Any]]:
    """Fetch a GTFS-realtime feed and return parsed trip updates."""
    if not url:
        raise ValueError("Trip updates URL is required")

    try:
        async with create_async_client(timeout_s, allow_weak_tls) as client:
            response = await client.get(url)
            response.raise_for_status()
    except Exception:
        logger.exception("Failed to fetch GTFS-realtime trip updates from %s", url)
        raise

    feed = gtfs_realtime_pb2.FeedMessage()
    try:
        feed.ParseFromString(response.content)
    except Exception:
        logger.exception("Failed to parse GTFS-realtime trip updates feed from %s", url)
        raise

    return parse_trip_updates(feed)


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
