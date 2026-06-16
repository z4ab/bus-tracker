"""Helpers for fetching and parsing GTFS-realtime service alerts."""

import logging
from typing import Any, Dict, List, Optional

from google.transit import gtfs_realtime_pb2

from services.http_client import create_async_client

logger = logging.getLogger(__name__)


def _extract_text(text) -> Optional[str]:
    """Extract text from a TranslatedString, preferring English."""
    if text is None:
        return None
    for translation in text.translation:
        if translation.language == "en" or not translation.language:
            return translation.text
    if text.translation:
        return text.translation[0].text
    return None


def parse_alerts(feed_message: gtfs_realtime_pb2.FeedMessage) -> List[Dict[str, Any]]:
    """Convert a GTFS-realtime feed into a list of alert dictionaries."""
    alerts: List[Dict[str, Any]] = []

    for entity in feed_message.entity:
        if not entity.HasField("alert"):
            continue

        alert = entity.alert
        alert_id = entity.id

        header = _extract_text(alert.header_text)
        description = _extract_text(alert.description_text)

        # Affected routes (informed entities of type route)
        route_ids: List[str] = []
        for informed in alert.informed_entity:
            if informed.route_id:
                route_ids.append(informed.route_id)

        # Cause
        cause = None
        if alert.HasField("cause"):
            cause = gtfs_realtime_pb2.Alert.Cause.Name(alert.cause)

        # Effect
        effect = None
        if alert.HasField("effect"):
            effect = gtfs_realtime_pb2.Alert.Effect.Name(alert.effect)

        # Active periods
        active_periods: List[Dict[str, int]] = []
        for period in alert.active_period:
            entry = {}
            if period.HasField("start"):
                entry["start"] = period.start
            if period.HasField("end"):
                entry["end"] = period.end
            if entry:
                active_periods.append(entry)

        alerts.append(
            {
                "alert_id": alert_id,
                "header_text": header,
                "description_text": description,
                "route_ids": route_ids,
                "cause": cause,
                "effect": effect,
                "active_periods": active_periods,
            }
        )

    return alerts


async def fetch_alerts(
    url: str,
    timeout_s: float = 10.0,
    allow_weak_tls: bool = False,
) -> List[Dict[str, Any]]:
    """Fetch a GTFS-realtime alerts feed and return parsed alerts."""
    if not url:
        raise ValueError("Alerts URL is required")

    try:
        async with create_async_client(timeout_s, allow_weak_tls) as client:
            response = await client.get(url)
            response.raise_for_status()
    except Exception:
        logger.exception("Failed to fetch GTFS-realtime alerts from %s", url)
        raise

    feed = gtfs_realtime_pb2.FeedMessage()
    try:
        feed.ParseFromString(response.content)
    except Exception:
        logger.exception("Failed to parse GTFS-realtime alerts feed from %s", url)
        raise

    return parse_alerts(feed)
