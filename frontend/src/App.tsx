import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "./api/client";
import MapView from "./components/MapView";
import NearbyStopsPanel from "./components/NearbyStopsPanel";
import Sidebar from "./components/Sidebar";
import { useNearbyStops } from "./hooks/useNearbyStops";
import { useRoutes } from "./hooks/useRoutes";
import { useVehicleArrivals } from "./hooks/useVehicleArrivals";
import { useVehiclePositions } from "./hooks/useVehiclePositions";
import type { CacheStatus } from "./api/types";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export const formatAge = (seconds: number | null): string | null => {
  if (seconds === null) return null;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export default function App() {
  const queryClient = useQueryClient();
  const routesQuery = useRoutes();
  const positionsQuery = useVehiclePositions();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [focusedStopIndex, setFocusedStopIndex] = useState<number | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const nearbyStopsQuery = useNearbyStops(mapCenter);
  const arrivalsQuery = useVehicleArrivals(selectedVehicleId);

  const handleSelectStop = useCallback((stopId: string) => {
    setSelectedStopId((prev) => (prev === stopId ? null : stopId));
  }, []);

  const handleSelectVehicle = useCallback((vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setSelectedStopId(null);
    setFocusedStopIndex(null);
  }, []);

  const handleClearVehicleSelection = useCallback(() => {
    setSelectedVehicleId(null);
    setSelectedStopId(null);
    setFocusedStopIndex(null);
  }, []);

  const handleCenterChange = useCallback((lat: number, lon: number) => {
    setMapCenter([lat, lon]);
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      await apiPost("/api/refresh");
      await queryClient.invalidateQueries();
    } catch {
      // Error will surface via the existing stale/error banner on next refetch
    }
  }, [queryClient]);

  const routes = routesQuery.data ?? [];
  const positions = positionsQuery.data?.positions ?? [];
  const cacheStatus: CacheStatus | undefined = positionsQuery.data?.cacheStatus;

  const loading = routesQuery.isLoading || positionsQuery.isLoading;
  const error = routesQuery.error ?? positionsQuery.error;
  const stale = !loading && cacheStatus?.stale;
  const hasVehicles = positions.length > 0;
  const hasRoutes = routes.length > 0;
  const showNoVehiclesMessage = !loading && !error && hasRoutes && !hasVehicles && !stale;

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar
        routes={routes}
        positions={positions}
        loading={loading}
        onSelectRoute={setSelectedRouteId}
        selectedRouteId={selectedRouteId}
        isOpen={sidebarOpen}
        onToggle={handleToggleSidebar}
        selectedVehicleId={selectedVehicleId}
        arrivals={arrivalsQuery.data?.stops ?? []}
        arrivalsLoading={arrivalsQuery.isLoading}
      >
        <NearbyStopsPanel
          stops={nearbyStopsQuery.data ?? []}
          isLoading={nearbyStopsQuery.isLoading}
          focusedIndex={focusedStopIndex}
          selectedStopId={selectedStopId}
          onSelectStop={handleSelectStop}
          onFocusChange={setFocusedStopIndex}
        />
      </Sidebar>

      {/* Main Content */}
      <div className="flex-1 relative min-w-0 lg:ml-72">
        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          className="absolute top-3 right-3 z-20 p-2 rounded-full bg-white/80 hover:bg-white shadow hover:shadow-md transition-all duration-200 text-gray-600 hover:text-blue-600"
          title="Refresh data now"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        {error && (
          <div className="absolute top-0 left-0 right-0 p-4 bg-red-50 border-l-4 border-red-400 z-10">
            <p className="text-red-700 text-sm">{getErrorMessage(error)}</p>
          </div>
        )}
        {stale && (
          <div className="absolute top-0 left-0 right-0 z-10">
            <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mx-4 mt-4 rounded shadow">
              <p className="text-amber-800 text-sm flex items-center gap-2">
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <span>
                  Data may be stale —
                  {cacheStatus?.refreshError
                    ? " a feed refresh failed recently"
                    : cacheStatus?.lastRefreshAgeSeconds !== null
                      ? ` last updated ${formatAge(cacheStatus!.lastRefreshAgeSeconds)} ago`
                      : " waiting for first successful refresh"}
                </span>
              </p>
            </div>
          </div>
        )}
        {loading ? (
          <div className="h-full flex items-center justify-center bg-gray-100">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            {showNoVehiclesMessage && (
              <div className="absolute top-0 left-0 right-0 z-10">
                <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mx-4 mt-4 rounded shadow">
                  <p className="text-blue-800 text-sm flex items-center gap-2">
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>No buses currently running on the tracked routes.</span>
                  </p>
                </div>
              </div>
            )}
            <MapView
              positions={positions}
              routes={routes}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              mapCenter={mapCenter}
              onCenterChange={handleCenterChange}
              nearbyStops={nearbyStopsQuery.data ?? []}
              focusedStopIndex={focusedStopIndex}
              selectedStopId={selectedStopId}
              onSelectStop={handleSelectStop}
              onFocusChange={setFocusedStopIndex}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={handleSelectVehicle}
              onClearVehicleSelection={handleClearVehicleSelection}
              arrivals={arrivalsQuery.data?.stops ?? []}
              arrivalsLoading={arrivalsQuery.isLoading}
            />
          </>
        )}
      </div>
    </div>
  );
}
