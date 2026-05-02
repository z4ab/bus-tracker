import { useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Route, VehiclePosition } from "../api/types";

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

export default function MapView({ positions, routes }: MapViewProps) {
  const routeIndex = useMemo(() => buildRouteIndex(routes), [routes]);
  const iconCache = useRef(new Map<string, L.DivIcon>());
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

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

  const validPositions = positions.filter(
    (position) => Number.isFinite(position.lat) && Number.isFinite(position.lon)
  );

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
              },
            }}
          >
            <Popup>
              <div>
                <strong>Route:</strong> {shortName}
              </div>
              <div>
                <strong>Vehicle ID:</strong> {position.id}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
