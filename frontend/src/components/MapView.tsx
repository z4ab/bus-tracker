import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Route, VehiclePosition } from "../api/types";
import { useVehicleArrivals } from "../hooks/useVehicleArrivals";
import { useNearbyStops } from "../hooks/useNearbyStops";
import MapBindings from "./MapBindings";
import VehicleMarker from "./VehicleMarker";
import UserMarker from "./UserMarker";
import TripStopMarker from "./TripStopMarker";
import NearbyStopsPanel from "./NearbyStopsPanel";

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

export default function MapView({ positions, routes }: MapViewProps) {
  const routeIndex = useMemo(() => buildRouteIndex(routes), [routes]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [focusedStopIndex, setFocusedStopIndex] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const arrivalsQuery = useVehicleArrivals(selectedVehicleId);

  // Nearby stops — fetched via debounced map center
  const nearbyStopsQuery = useNearbyStops(mapCenter);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          // Default center to user location on first load
          if (!mapCenter) {
            setMapCenter([position.coords.latitude, position.coords.longitude]);
          }
        },
        () => {
          // Silently fail if geolocation is denied; use default center
          if (!mapCenter) {
            setMapCenter(defaultCenter);
          }
        }
      );
    } else if (!mapCenter) {
      setMapCenter(defaultCenter);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCenterChange = useCallback((lat: number, lon: number) => {
    setMapCenter([lat, lon]);
  }, []);

  const handleZoomToLocation = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.setView(userLocation, 16);
    }
  }, [userLocation]);

  const handleVehicleSelect = useCallback((vehicleId: string, routeId: string | undefined) => {
    if (routeId) {
      setSelectedRouteId(routeId);
    }
    setSelectedVehicleId(vehicleId);
    // Clear stop selection when selecting a vehicle
    setSelectedStopId(null);
  }, []);

  const handleSelectStop = useCallback((stopId: string) => {
    setSelectedStopId((prev) => (prev === stopId ? null : stopId));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedRouteId(null);
    setSelectedVehicleId(null);
    setSelectedStopId(null);
    setFocusedStopIndex(null);
  }, []);

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

  const nearbyStops = useMemo(() => nearbyStopsQuery.data ?? [], [nearbyStopsQuery.data]);

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
            setSelectedStopId(null);
          } else if (selectedVehicleId) {
            handleClearSelection();
          }
          setFocusedStopIndex(null);
          break;
        }

        case "ArrowDown": {
          e.preventDefault();
          const maxIndex = Math.min(5, nearbyStops.length) - 1;
          if (maxIndex < 0) break;
          setFocusedStopIndex((prev) => {
            if (prev === null) return 0;
            return Math.min(prev + 1, maxIndex);
          });
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          if (nearbyStops.length === 0) break;
          setFocusedStopIndex((prev) => {
            if (prev === null || prev <= 0) return 0;
            return prev - 1;
          });
          break;
        }

        case "Enter": {
          if (focusedStopIndex !== null && nearbyStops[focusedStopIndex]) {
            handleSelectStop(nearbyStops[focusedStopIndex].stopId);
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
    nearbyStops,
    focusedStopIndex,
    handleSelectStop,
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
            />
          ))}
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
          onCenterChange={handleCenterChange}
          onZoomToLocation={handleZoomToLocation}
          userLocationEnabled={!!userLocation}
        />
      </MapContainer>

      {/* Nearby stops overlay */}
      {nearbyStops.length > 0 && (
        <NearbyStopsPanel
          stops={nearbyStops}
          focusedIndex={focusedStopIndex}
          selectedStopId={selectedStopId}
          onSelectStop={handleSelectStop}
          onFocusChange={setFocusedStopIndex}
        />
      )}
    </div>
  );
}
