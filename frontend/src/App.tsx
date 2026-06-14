import MapView from "./components/MapView";
import Sidebar from "./components/Sidebar";
import { useRoutes } from "./hooks/useRoutes";
import { useVehiclePositions } from "./hooks/useVehiclePositions";
import type { CacheStatus } from "./api/types";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const formatAge = (seconds: number | null): string | null => {
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
  const routesQuery = useRoutes();
  const positionsQuery = useVehiclePositions();

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
      <Sidebar routes={routes} positions={positions} loading={loading} />
      {/* Main Content */}
      <div className="flex-1 relative min-w-0">
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
            <MapView positions={positions} routes={routes} />
          </>
        )}
      </div>
    </div>
  );
}
