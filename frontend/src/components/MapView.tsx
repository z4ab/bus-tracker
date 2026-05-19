import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { renderToString } from "react-dom/server";
import L, { Control } from "leaflet";
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

// User location marker component
const UserLocationMarker = () => (
  <div className="relative flex items-center justify-center">
    <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md" />
    <div className="absolute w-8 h-8 border-2 border-blue-400 rounded-full animate-pulse" />
  </div>
);

const buildUserLocationMarkerHtml = () => {
  return renderToString(<UserLocationMarker />);
};

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

// Custom Leaflet Control for locating user
class LocateControl extends Control {
  private onLocate: (() => void) | null = null;
  private isDisabled = true;

  setOnLocate(callback: () => void, isDisabled: boolean) {
    this.onLocate = callback;
    this.isDisabled = isDisabled;
    if (this._button) {
      this._button.disabled = isDisabled;
    }
  }

  private _button: HTMLButtonElement | null = null;

  onAdd() {
    const container = L.DomUtil.create("div", "leaflet-control leaflet-bar");
    this._button = L.DomUtil.create("button", "", container) as HTMLButtonElement;
    this._button.type = "button";
    this._button.disabled = this.isDisabled;
    this._button.title = "Zoom to your location";
    this._button.className =
      "bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 transition flex items-center justify-center w-9 h-9";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "w-5 h-5");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("viewBox", "0 0 24 24");

    const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path1.setAttribute("stroke-linecap", "round");
    path1.setAttribute("stroke-linejoin", "round");
    path1.setAttribute("stroke-width", "2");
    path1.setAttribute("d", "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z");

    const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path2.setAttribute("stroke-linecap", "round");
    path2.setAttribute("stroke-linejoin", "round");
    path2.setAttribute("stroke-width", "2");
    path2.setAttribute("d", "M15 11a3 3 0 11-6 0 3 3 0 016 0z");

    svg.appendChild(path1);
    svg.appendChild(path2);
    this._button.appendChild(svg);

    L.DomEvent.on(this._button, "click", () => {
      if (this.onLocate && !this.isDisabled) {
        this.onLocate();
      }
    });

    L.DomEvent.disableClickPropagation(this._button);

    return container;
  }

  onRemove() {
    this._button = null;
  }
}

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
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const arrivalsQuery = useVehicleArrivals(selectedVehicleId);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        () => {
          // Silently fail if geolocation is denied
        }
      );
    }
  }, []);

  const handleZoomToLocation = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.setView(userLocation, 16);
    }
  }, [userLocation]);

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

  const getUserLocationIcon = () => {
    const cacheKey = "user-location";
    const cached = stopIconCache.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const icon = L.divIcon({
      className: "user-location-marker",
      html: buildUserLocationMarkerHtml(),
      iconSize: [32, 32],
      iconAnchor: [16, 16],
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
    <div className="relative h-full w-full">
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
        {userLocation && (
          <Marker
            position={userLocation}
            icon={getUserLocationIcon()}
            zIndexOffset={400}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold text-gray-900">Your Location</div>
                <div className="text-gray-600">
                  {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}
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
        <MapRefCapture 
          mapRef={mapRef} 
          onZoomToLocation={handleZoomToLocation}
          userLocationEnabled={!!userLocation}
        />
      </MapContainer>
    </div>
  );
}

// Capture map ref inside MapContainer
function MapRefCapture({ 
  mapRef, 
  onZoomToLocation,
  userLocationEnabled,
}: { 
  mapRef: React.MutableRefObject<L.Map | null>,
  onZoomToLocation: () => void,
  userLocationEnabled: boolean,
}) {
  const map = useMap();
  const controlRef = useRef<LocateControl | null>(null);
  
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  useEffect(() => {
    if (!map) return;

    // Add locate control if not already added
    if (!controlRef.current) {
      const control = new LocateControl({ position: "topright" });
      control.addTo(map);
      controlRef.current = control;
    }

    // Update control state
    if (controlRef.current) {
      controlRef.current.setOnLocate(onZoomToLocation, !userLocationEnabled);
    }

    return () => {
      // Cleanup is optional; controls typically persist for the map's lifetime
    };
  }, [map, onZoomToLocation, userLocationEnabled]);

  return null;
}
