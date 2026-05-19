import { useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import { renderToString } from "react-dom/server";
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

// Route marker component
const RouteMarker = ({
  shortName,
  color,
  textColor,
}: {
  shortName: string;
  color: string;
  textColor: string;
}) => (
  <div
    className="w-8 h-8 flex items-center justify-center rounded-full border-2 border-white font-bold text-xs shadow-md"
    style={{
      backgroundColor: color,
      color: textColor,
    }}
  >
    {shortName}
  </div>
);

// Stop marker component
const StopMarker = ({ label }: { label: string }) => (
  <div className="flex items-center gap-1.5" style={{ transform: "translate(-6px, -6px)" }}>
    <div
      className="w-3 h-3 rounded-full border-2 border-blue-600 bg-white shadow-sm"
    />
    <div
      className="whitespace-nowrap rounded-md bg-white text-gray-900 text-xs font-semibold px-1.5 py-0.5 shadow-sm"
    >
      {label}
    </div>
  </div>
);

const buildMarkerHtml = (
  shortName: string,
  color: string,
  textColor: string,
) => {
  return renderToString(
    <RouteMarker shortName={shortName} color={color} textColor={textColor} />
  );
};

const buildStopMarkerHtml = (label: string) => {
  return renderToString(<StopMarker label={label} />);
};

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
  ) => {
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
      className="h-full w-full"
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
                <div className="text-sm">
                  <div className="font-semibold text-gray-900">
                    {stop.stopName ?? stop.stopId ?? "Stop"}
                  </div>
                  <div className="text-gray-600">{label} away</div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      {validPositions.map((position) => {
        const route = position.routeId ? routeIndex.get(position.routeId) : undefined;
        const shortName = position.routeShortName ?? route?.shortName ?? "?";
        const color = position.routeColor ?? route?.color ?? "#1976d2";
        const textColor = route?.textColor ?? "#ffffff";
        const icon = getMarkerIcon(shortName, color, textColor);

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
          </Marker>
        );
      })}
    </MapContainer>
  );
}
