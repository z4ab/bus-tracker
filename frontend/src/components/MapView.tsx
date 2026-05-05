import { useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Route, VehiclePosition } from "../api/types";
import { useVehicleArrivals } from "../hooks/useVehicleArrivals";

interface MapViewProps {
  positions: VehiclePosition[];
  routes: Route[];
}

const defaultCenter: [number, number] = [43.4516, -80.4925];
const defaultZoom = 12;

const buildRouteIndex = (routes: Route[]) => {
  const map = new Map<string, Route>();
  routes.forEach((route) => map.set(route.id, route));
  return map;
};

const buildMarkerHtml = (
  shortName: string,
  color: string,
  textColor: string,
  heading: number | null
) => {
  const arrow = Number.isFinite(heading)
    ? `
      <div style="
        position: absolute;
        left: 50%;
        top: 50%;
        width: 0;
        height: 0;
        transform: translate(-50%, -50%) rotate(${heading}deg);
      ">
        <div style="
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-bottom: 10px solid ${textColor};
          filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
          transform: translateY(-18px);
        "></div>
      </div>
    `
    : "";

  return `
  <div style="
    position: relative;
    background: ${color};
    color: ${textColor};
    border-radius: 999px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 12px;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  ">${shortName}${arrow}</div>
`;
};

const buildStopMarkerHtml = (label: string) => `
  <div style="
    display: flex;
    align-items: center;
    gap: 6px;
    transform: translate(-6px, -6px);
  ">
    <div style="
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: #ffffff;
      border: 2px solid #1976d2;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    "></div>
    <div style="
      background: #ffffff;
      color: #111827;
      border-radius: 10px;
      padding: 2px 6px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      white-space: nowrap;
    ">${label}</div>
  </div>
`;

const formatMinutes = (minutes: number) => {
  if (minutes <= 0) {
    return "due";
  }
  return `${minutes} min`;
};

export default function MapView({ positions, routes }: MapViewProps) {
  const routeIndex = useMemo(() => buildRouteIndex(routes), [routes]);
  const iconCache = useRef(new Map<string, L.DivIcon>());
  const stopIconCache = useRef(new Map<string, L.DivIcon>());
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const arrivalsQuery = useVehicleArrivals(selectedVehicleId);

  const selectedRoute = selectedRouteId ? routeIndex.get(selectedRouteId) : undefined;
  const selectedRoutePoints = useMemo(() => {
    if (!selectedRoute?.shape || selectedRoute.shape.length < 2) {
      return [];
    }
    return selectedRoute.shape.map((point) => [point.lat, point.lon] as [number, number]);
  }, [selectedRoute]);

  const getMarkerIcon = (
    shortName: string,
    color: string,
    textColor: string,
    heading: number | null
  ) => {
    const headingBucket = Number.isFinite(heading) ? Math.round((heading ?? 0) / 10) * 10 : "none";
    const cacheKey = `${shortName}-${color}-${textColor}-${headingBucket}`;
    const cached = iconCache.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const icon = L.divIcon({
      className: "route-marker",
      html: buildMarkerHtml(shortName, color, textColor, heading),
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    iconCache.current.set(cacheKey, icon);
    return icon;
  };

  const getStopIcon = (label: string) => {
    const cacheKey = label;
    const cached = stopIconCache.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const icon = L.divIcon({
      className: "stop-marker",
      html: buildStopMarkerHtml(label),
      iconSize: [60, 24],
      iconAnchor: [6, 12],
    });

    stopIconCache.current.set(cacheKey, icon);
    return icon;
  };

  const validPositions = positions.filter(
    (position) => Number.isFinite(position.lat) && Number.isFinite(position.lon)
  );

  const upcomingStops = useMemo(() => {
    if (!arrivalsQuery.data) {
      return [];
    }
    const nowSeconds = Date.now() / 1000;
    return arrivalsQuery.data.stops
      .map((stop) => {
        const predictedTime = stop.arrivalTime ?? stop.departureTime ?? null;
        if (!predictedTime) {
          return null;
        }
        const minutesAway = Math.round((predictedTime - nowSeconds) / 60);
        return {
          ...stop,
          predictedTime,
          minutesAway,
        };
      })
      .filter((stop): stop is Exclude<typeof stop, null> => Boolean(stop))
      .filter((stop) => stop.predictedTime >= nowSeconds - 60)
      .sort((a, b) => a.predictedTime - b.predictedTime)
      .slice(0, 5);
  }, [arrivalsQuery.data]);

  const upcomingStopsWithCoords = useMemo(() => {
    return upcomingStops.filter(
      (stop): stop is typeof stop & { stopLat: number; stopLon: number } =>
        typeof stop.stopLat === "number" &&
        Number.isFinite(stop.stopLat) &&
        typeof stop.stopLon === "number" &&
        Number.isFinite(stop.stopLon)
    );
  }, [upcomingStops]);

  return (
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      scrollWheelZoom
      style={{ height: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {selectedRoutePoints.length > 1 && (
        <Polyline
          positions={selectedRoutePoints}
          pathOptions={{
            color: selectedRoute?.color ?? "#1976d2",
            weight: 6,
            opacity: 0.9,
          }}
        />
      )}
      {selectedVehicleId &&
        upcomingStopsWithCoords.map((stop, index) => {
          const label = formatMinutes(stop.minutesAway);
          const icon = getStopIcon(label);
          return (
            <Marker
              key={`${stop.stopId ?? "stop"}-${stop.stopSequence ?? index}`}
              position={[stop.stopLat, stop.stopLon]}
              icon={icon}
              zIndexOffset={300}
            >
              <Popup>
                <div>
                  <strong>{stop.stopName ?? stop.stopId ?? "Stop"}</strong>
                </div>
                <div>{label} away</div>
              </Popup>
            </Marker>
          );
        })}
      {validPositions.map((position) => {
        const route = position.routeId ? routeIndex.get(position.routeId) : undefined;
        const shortName = position.routeShortName ?? route?.shortName ?? "?";
        const color = position.routeColor ?? route?.color ?? "#1976d2";
        const textColor = route?.textColor ?? "#ffffff";
        const heading = Number.isFinite(position.heading) ? (position.heading ?? null) : null;
        const icon = getMarkerIcon(shortName, color, textColor, heading);

        return (
          <Marker
            key={position.id}
            position={[position.lat, position.lon]}
            icon={icon}
            eventHandlers={{
              click: () => {
                if (position.routeId) {
                  setSelectedRouteId(position.routeId);
                }
                setSelectedVehicleId(position.id);
              },
            }}
          >
            <Popup>
              <div style={{ minWidth: "180px" }}>
                <div>
                  <strong>Route:</strong> {shortName}
                </div>
                <div>
                  <strong>Vehicle ID:</strong> {position.id}
                </div>
                {selectedVehicleId === position.id && (
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>Next stops</div>
                    {arrivalsQuery.isLoading && <div>Loading arrivals...</div>}
                    {arrivalsQuery.error && (
                      <div style={{ color: "#b00020" }}>Arrivals unavailable</div>
                    )}
                    {!arrivalsQuery.isLoading && !arrivalsQuery.error && (
                      <div>
                        {upcomingStops.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: "16px" }}>
                            {upcomingStops.map((stop, index) => (
                              <li key={`${stop.stopId ?? "stop"}-${stop.stopSequence ?? index}`}>
                                <div>{stop.stopName ?? stop.stopId ?? "Unknown stop"}</div>
                                <div style={{ fontSize: "12px", color: "#555" }}>
                                  {formatMinutes(stop.minutesAway)} ·{" "}
                                  {new Date(stop.predictedTime * 1000).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div>No arrival predictions yet.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
