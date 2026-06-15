import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Route, Stop, VehiclePosition } from "../api/types";
import { useVehicleArrivals } from "../hooks/useVehicleArrivals";
import MapBindings from "./MapBindings";
import SelectedVehicleMarker from "./SelectedVehicleMarker";
import VehicleMarker from "./VehicleMarker";
import UserMarker from "./UserMarker";
import TripStopMarker from "./TripStopMarker";

interface MapViewProps {
  positions: VehiclePosition[];
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
  /** Current map center for nearby-stops queries */
  mapCenter: [number, number] | null;
  onCenterChange: (lat: number, lon: number) => void;
  /** Nearby stops data (fetched by App) */
  nearbyStops: Stop[];
  /** Current stop focus/selection (shared with sidebar) */
  focusedStopIndex: number | null;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  onFocusChange: (index: number | null) => void;
  /** Clear stop-focused state (but not route selection) */
  onClearStopSelection: () => void;
}

const defaultCenter: [number, number] = [43.4516, -80.4925];
const defaultZoom = 12;

const buildRouteIndex = (routes: Route[]) => {
  const map = new Map<string, Route>();
  routes.forEach((route) => map.set(route.id, route));
  return map;
};

export default function MapView({
  positions,
  routes,
  selectedRouteId,
  onSelectRoute,
  mapCenter,
  onCenterChange,
  nearbyStops,
  focusedStopIndex: _focusedStopIndex,
  selectedStopId,
  onSelectStop,
  onFocusChange,
  onClearStopSelection,
}: MapViewProps) {
  const routeIndex = useMemo(() => buildRouteIndex(routes), [routes]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const arrivalsQuery = useVehicleArrivals(selectedVehicleId);

  // Set initial map center from geolocation (runs once on mount)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          if (!mapCenter) {
            onCenterChange(position.coords.latitude, position.coords.longitude);
          }
        },
        () => {
          if (!mapCenter) {
            onCenterChange(defaultCenter[0], defaultCenter[1]);
          }
        }
      );
    } else if (!mapCenter) {
      onCenterChange(defaultCenter[0], defaultCenter[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleZoomToLocation = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.setView(userLocation, 16);
    }
  }, [userLocation]);

  const handleVehicleSelect = useCallback(
    (vehicleId: string, routeId: string | undefined) => {
      if (routeId) {
        onSelectRoute(routeId);
      }
      setSelectedVehicleId(vehicleId);
      // Clear stop selection when selecting a vehicle
      onClearStopSelection();

      // Fly to the selected vehicle
      const vehicle = positions.find((p) => p.id === vehicleId);
      if (
        vehicle &&
        mapRef.current &&
        Number.isFinite(vehicle.lat) &&
        Number.isFinite(vehicle.lon)
      ) {
        mapRef.current.flyTo([vehicle.lat, vehicle.lon], 14, { duration: 1 });
      }
    },
    [positions, onSelectRoute, onClearStopSelection]
  );

  const handleClearSelection = useCallback(() => {
    onSelectRoute(null);
    setSelectedVehicleId(null);
    onClearStopSelection();
  }, [onSelectRoute, onClearStopSelection]);

  const selectedRoute = selectedRouteId ? routeIndex.get(selectedRouteId) : undefined;
  const selectedRoutePoints = useMemo(() => {
    if (!selectedRoute?.shape || selectedRoute.shape.length < 2) {
      return [];
    }
    return selectedRoute.shape.map((point) => [point.lat, point.lon] as [number, number]);
  }, [selectedRoute]);

  const validPositions = positions.filter(
    (position) => Number.isFinite(position.lat) && Number.isFinite(position.lon)
  );

  // Selected vehicle for showing its position marker on the map
  const selectedVehicle = selectedVehicleId
    ? validPositions.find((p) => p.id === selectedVehicleId)
    : undefined;

  const selectedVehicleRoute = selectedVehicle?.routeId
    ? routeIndex.get(selectedVehicle.routeId)
    : undefined;

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
          passed: predictedTime < nowSeconds,
        };
      })
      .filter((stop): stop is Exclude<typeof stop, null> => Boolean(stop))
      .sort((a, b) => a.predictedTime - b.predictedTime)
      .slice(0, 10);
  }, [arrivalsQuery.data]);

  const upcomingStopsWithCoords = useMemo(() => {
    return upcomingStops.filter(
      (
        stop
      ): stop is typeof stop & {
        stopLat: number;
        stopLon: number;
      } =>
        typeof stop.stopLat === "number" &&
        Number.isFinite(stop.stopLat) &&
        typeof stop.stopLon === "number" &&
        Number.isFinite(stop.stopLon)
    );
  }, [upcomingStops]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  // Use a ref for focusedStopIndex so the keyboard event handler always has the
  // latest value without needing it as a useEffect dependency (which would cause
  // constant add/remove of the listener).
  const focusedStopIndexRef = useRef<number | null>(null);
  focusedStopIndexRef.current = _focusedStopIndex;

  const nearbyStopsCurrent = nearbyStops;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key) {
        case "Escape": {
          if (selectedStopId) {
            onSelectStop(selectedStopId);
          } else if (selectedVehicleId) {
            handleClearSelection();
          }
          onFocusChange(null);
          break;
        }

        case "ArrowDown": {
          e.preventDefault();
          const maxIndex = Math.min(5, nearbyStopsCurrent.length) - 1;
          if (maxIndex < 0) break;
          onFocusChange(
            focusedStopIndexRef.current === null
              ? 0
              : Math.min(focusedStopIndexRef.current + 1, maxIndex)
          );
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          if (nearbyStopsCurrent.length === 0) break;
          const current = focusedStopIndexRef.current;
          if (current === null || current <= 0) {
            onFocusChange(0);
          } else {
            onFocusChange(current - 1);
          }
          break;
        }

        case "Enter": {
          const focused = focusedStopIndexRef.current;
          if (focused !== null && nearbyStopsCurrent[focused]) {
            onSelectStop(nearbyStopsCurrent[focused].stopId);
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedStopId,
    selectedVehicleId,
    nearbyStopsCurrent,
    onSelectStop,
    onFocusChange,
    handleClearSelection,
  ]);

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
        {userLocation && <UserMarker position={userLocation} />}
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
          upcomingStopsWithCoords.map((stop, index) => (
            <TripStopMarker
              key={`${stop.stopId ?? "stop"}-${stop.stopSequence ?? index}`}
              stop={stop}
              index={index}
              passed={stop.passed}
            />
          ))}
        {selectedVehicle &&
          Number.isFinite(selectedVehicle.lat) &&
          Number.isFinite(selectedVehicle.lon) && (
            <SelectedVehicleMarker
              position={[selectedVehicle.lat, selectedVehicle.lon]}
              color={selectedVehicleRoute?.color}
            />
          )}
        {validPositions.map((position) => (
          <VehicleMarker
            key={position.id}
            position={position}
            routeIndex={routeIndex}
            onSelect={handleVehicleSelect}
          />
        ))}
        <MapBindings
          mapRef={mapRef}
          onCenterChange={onCenterChange}
          onZoomToLocation={handleZoomToLocation}
          userLocationEnabled={!!userLocation}
        />
      </MapContainer>
    </div>
  );
}
