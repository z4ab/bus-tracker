"""Application configuration loaded from environment variables."""

import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# Default refresh interval (in seconds) used when REFRESH_SECONDS is not set.
DEFAULT_REFRESH_SECONDS = 30


@dataclass(frozen=True)
class Settings:
    """Typed settings container for backend configuration."""

    GRT_VEHICLE_POSITIONS_URL: str
    GRT_TRIP_UPDATES_URL: Optional[str]
    GRT_ALERTS_URL: Optional[str]
    GRT_GTFS_STATIC_URL: str
    REFRESH_SECONDS: int
    GRT_ALLOW_WEAK_TLS: bool


def _get_required_env(name: str) -> str:
    """Fetch a required environment variable or raise a runtime error."""
    value = os.getenv(name)
    if not value:
        message = f"Missing required environment variable: {name}"
        logger.error(message)
        raise RuntimeError(message)
    return value


def _get_optional_env(name: str) -> Optional[str]:
    """Fetch an optional environment variable, returning None if unset."""
    value = os.getenv(name)
    if value:
        return value
    return None


def _get_int_env(name: str, default: int) -> int:
    """Fetch an integer environment variable with a fallback default."""
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        message = f"Invalid integer for environment variable {name}: {raw}"
        logger.error(message)
        raise RuntimeError(message) from exc


def _get_bool_env(name: str, default: bool = False) -> bool:
    """Fetch a boolean environment variable with a fallback default."""
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    message = f"Invalid boolean for environment variable {name}: {raw}"
    logger.error(message)
    raise RuntimeError(message)


@lru_cache(maxsize=1)
def load_settings() -> Settings:
    """Load settings once and cache them for the process lifetime."""
    return Settings(
        GRT_VEHICLE_POSITIONS_URL=_get_required_env("GRT_VEHICLE_POSITIONS_URL"),
        GRT_TRIP_UPDATES_URL=_get_optional_env("GRT_TRIP_UPDATES_URL"),
        GRT_ALERTS_URL=_get_optional_env("GRT_ALERTS_URL"),
        GRT_GTFS_STATIC_URL=_get_required_env("GRT_GTFS_STATIC_URL"),
        REFRESH_SECONDS=_get_int_env("REFRESH_SECONDS", DEFAULT_REFRESH_SECONDS),
        GRT_ALLOW_WEAK_TLS=_get_bool_env("GRT_ALLOW_WEAK_TLS", False),
    )
