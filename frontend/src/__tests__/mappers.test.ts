import { describe, it, expect } from "vitest";
import { toVehiclePosition, toCacheStatus } from "../hooks/useVehiclePositions";
import { toRoute } from "../hooks/useRoutes";
import { toStop } from "../hooks/useNearbyStops";
import { toAlert } from "../hooks/useAlerts";
import { toDeparture } from "../hooks/useStopDepartures";
import { formatAge } from "../App";

// ---------------------------------------------------------------------------
// toVehiclePosition
// ---------------------------------------------------------------------------
describe("toVehiclePosition", () => {
  it("maps a full response correctly", () => {
    const result = toVehiclePosition({
      vehicle_id: "veh-1",
      trip_id: "trip-1",
      route_id: "200",
      latitude: 43.45,
      longitude: -80.49,
      bearing: 90,
      speed: 12.5,
      timestamp: 1710000000,
      transport_type: "bus",
    });
    expect(result).toEqual({
      id: "veh-1",
      lat: 43.45,
      lon: -80.49,
      routeId: "200",
      heading: 90,
      speed: 12.5,
      updatedAt: "2024-03-09T16:00:00.000Z",
      transportType: "bus",
    });
  });

  it("handles null/undefined fields", () => {
    const result = toVehiclePosition({});
    expect(result.id).toBe("unknown");
    expect(Number.isNaN(result.lat)).toBe(true);
    expect(Number.isNaN(result.lon)).toBe(true);
    expect(result.routeId).toBeUndefined();
    expect(result.heading).toBeUndefined();
    expect(result.speed).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
    expect(result.transportType).toBe("bus");
  });

  it("detects LRT transport type", () => {
    const result = toVehiclePosition({ transport_type: "lrt" });
    expect(result.transportType).toBe("lrt");
  });
});

// ---------------------------------------------------------------------------
// toCacheStatus
// ---------------------------------------------------------------------------
describe("toCacheStatus", () => {
  it("maps response metadata correctly", () => {
    const result = toCacheStatus({
      vehicles: [],
      stale: true,
      last_updated: "2025-03-09T12:00:00Z",
      last_refresh_age_seconds: 30,
      refresh_error: "timeout",
    });
    expect(result).toEqual({
      lastUpdated: "2025-03-09T12:00:00Z",
      lastRefreshAgeSeconds: 30,
      stale: true,
      refreshError: "timeout",
    });
  });

  it("handles missing fields", () => {
    const result = toCacheStatus({ vehicles: [] });
    expect(result.lastUpdated).toBe("");
    expect(result.lastRefreshAgeSeconds).toBeNull();
    expect(result.stale).toBe(false);
    expect(result.refreshError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toRoute
// ---------------------------------------------------------------------------
describe("toRoute", () => {
  it("maps a full route with shape", () => {
    const result = toRoute({
      route_id: "200",
      route_short_name: "200",
      route_long_name: "iXpress",
      route_color: "#123456",
      route_text_color: "#FFFFFF",
      shape: [
        { lat: 43.45, lon: -80.49, sequence: 1 },
        { lat: 43.46, lon: -80.5, sequence: 2 },
        { lat: 43.47, lon: -80.51, sequence: 3 },
      ],
    });
    expect(result).toEqual({
      id: "200",
      shortName: "200",
      longName: "iXpress",
      color: "#123456",
      textColor: "#FFFFFF",
      shape: [
        { lat: 43.45, lon: -80.49, sequence: 1 },
        { lat: 43.46, lon: -80.5, sequence: 2 },
        { lat: 43.47, lon: -80.51, sequence: 3 },
      ],
    });
  });

  it("falls back to longName when shortName is missing", () => {
    const result = toRoute({ route_id: "200", route_long_name: "iXpress" });
    expect(result.shortName).toBe("iXpress");
  });

  it("falls back to routeId when both names are missing", () => {
    const result = toRoute({ route_id: "200" });
    expect(result.shortName).toBe("200");
  });

  it("filters invalid shape points", () => {
    const result = toRoute({
      route_id: "200",
      shape: [
        { lat: 43.45, lon: -80.49, sequence: 1 },
        { lat: null, lon: null, sequence: 2 },
        { lat: 43.47, lon: -80.51, sequence: 3 },
      ],
    });
    expect(result.shape).toEqual([
      { lat: 43.45, lon: -80.49, sequence: 1 },
      { lat: 43.47, lon: -80.51, sequence: 3 },
    ]);
  });

  it("ignores single-point shapes", () => {
    const result = toRoute({
      route_id: "200",
      shape: [{ lat: 43.45, lon: -80.49, sequence: 1 }],
    });
    expect(result.shape).toBeUndefined();
  });

  it("handles null shape", () => {
    const result = toRoute({ route_id: "200", shape: null });
    expect(result.shape).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toStop
// ---------------------------------------------------------------------------
describe("toStop", () => {
  it("maps a full stop correctly", () => {
    const result = toStop({
      stop_id: "1234",
      stop_name: "Main St",
      stop_lat: 43.45,
      stop_lon: -80.49,
      distance_m: 150,
      zone_id: "A",
      wheelchair_boarding: 1,
    });
    expect(result).toEqual({
      stopId: "1234",
      stopName: "Main St",
      stopLat: 43.45,
      stopLon: -80.49,
      distanceM: 150,
      zoneId: "A",
      wheelchairBoarding: 1,
    });
  });

  it("handles null fields", () => {
    const result = toStop({ stop_id: "1234" });
    expect(result.stopId).toBe("1234");
    expect(result.stopName).toBeUndefined();
    expect(result.stopLat).toBe(0);
    expect(result.stopLon).toBe(0);
    expect(result.distanceM).toBe(0);
    expect(result.zoneId).toBeUndefined();
    expect(result.wheelchairBoarding).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toAlert
// ---------------------------------------------------------------------------
describe("toAlert", () => {
  it("maps a full alert correctly", () => {
    const result = toAlert({
      alert_id: "alert-1",
      header_text: "Delay on Route 200",
      description_text: "Expect delays of 10-15 minutes",
      route_ids: ["200", "201"],
      cause: "MAINTENANCE",
      effect: "SIGNIFICANT_DELAYS",
      active_periods: [{ start: 1710000000, end: 1710086400 }],
    });
    expect(result).toEqual({
      alertId: "alert-1",
      headerText: "Delay on Route 200",
      descriptionText: "Expect delays of 10-15 minutes",
      routeIds: ["200", "201"],
      cause: "MAINTENANCE",
      effect: "SIGNIFICANT_DELAYS",
      activePeriods: [{ start: 1710000000, end: 1710086400 }],
    });
  });

  it("handles null fields", () => {
    const result = toAlert({});
    expect(result.alertId).toBeUndefined();
    expect(result.headerText).toBeUndefined();
    expect(result.descriptionText).toBeUndefined();
    expect(result.routeIds).toEqual([]);
    expect(result.cause).toBeUndefined();
    expect(result.effect).toBeUndefined();
    expect(result.activePeriods).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toDeparture
// ---------------------------------------------------------------------------
describe("toDeparture", () => {
  it("maps a full departure correctly", () => {
    const result = toDeparture({
      trip_id: "trip-1",
      route_id: "200",
      route_short_name: "200",
      route_color: "#123456",
      stop_id: "1234",
      arrival_time: 1710003600,
      departure_time: 1710003660,
      type: "predicted",
      minutes_away: 5,
    });
    expect(result).toEqual({
      tripId: "trip-1",
      routeId: "200",
      routeShortName: "200",
      routeColor: "#123456",
      stopId: "1234",
      arrivalTime: 1710003600,
      departureTime: 1710003660,
      type: "predicted",
      minutesAway: 5,
    });
  });

  it("handles null fields", () => {
    const result = toDeparture({
      trip_id: "trip-1",
      route_id: "200",
      stop_id: "1234",
      type: "scheduled",
    });
    expect(result.routeShortName).toBeUndefined();
    expect(result.routeColor).toBeUndefined();
    expect(result.arrivalTime).toBeUndefined();
    expect(result.departureTime).toBeUndefined();
    expect(result.minutesAway).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// formatAge
// ---------------------------------------------------------------------------
describe("formatAge", () => {
  it("returns null for null input", () => {
    expect(formatAge(null)).toBeNull();
  });

  it("formats seconds only", () => {
    expect(formatAge(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatAge(125)).toBe("2m 5s");
  });

  it("formats minutes only when seconds are zero", () => {
    expect(formatAge(120)).toBe("2m");
  });

  it("formats hours and minutes", () => {
    expect(formatAge(3660)).toBe("1h 1m");
  });

  it("formats hours only when minutes are zero", () => {
    expect(formatAge(7200)).toBe("2h");
  });

  it("handles zero seconds", () => {
    expect(formatAge(0)).toBe("0s");
  });
});
