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

      {/* Nearby stops overlay (debug / info) */}
      {nearbyStopsQuery.data && nearbyStopsQuery.data.length > 0 && (
        <NearbyStopsPanel stops={nearbyStopsQuery.data} />
      )}
    </div>
  );
}
