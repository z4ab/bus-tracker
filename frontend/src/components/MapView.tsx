import { useMemo, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
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

const buildMarkerHtml = (shortName: string, color: string, textColor: string) => `
  <div style="
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
  ">${shortName}</div>
`;

export default function MapView({ positions, routes }: MapViewProps) {
  const routeIndex = useMemo(() => buildRouteIndex(routes), [routes]);
  const iconCache = useRef(new Map<string, L.DivIcon>());

  const getMarkerIcon = (shortName: string, color: string, textColor: string) => {
    const cacheKey = `${shortName}-${color}-${textColor}`;
    const cached = iconCache.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const icon = L.divIcon({
      className: "route-marker",
      html: buildMarkerHtml(shortName, color, textColor),
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
      {validPositions.map((position) => {
        const route = position.routeId ? routeIndex.get(position.routeId) : undefined;
        const shortName = position.routeShortName ?? route?.shortName ?? "?";
        const color = position.routeColor ?? route?.color ?? "#1976d2";
        const textColor = route?.textColor ?? "#ffffff";
        const icon = getMarkerIcon(shortName, color, textColor);

        return (
          <Marker key={position.id} position={[position.lat, position.lon]} icon={icon}>
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
