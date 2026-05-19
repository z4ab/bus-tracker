import { useMemo, useState } from "react";
import MapView from "./components/MapView";
import { useRoutes } from "./hooks/useRoutes";
import { useVehiclePositions } from "./hooks/useVehiclePositions";
import type { Route } from "./api/types";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const buildRouteIndex = (routes: Route[] | undefined) => {
  const map = new Map<string, Route>();
  routes?.forEach((route) => map.set(route.id, route));
  return map;
};

export default function App() {
  const [panelOpen, setPanelOpen] = useState(false);
  const routesQuery = useRoutes();
  const positionsQuery = useVehiclePositions();

  const routes = routesQuery.data ?? [];
  const positions = positionsQuery.data ?? [];

  const routeIndex = useMemo(() => buildRouteIndex(routes), [routes]);

  const routeSummaries = useMemo(() => {
    const counts = new Map<string, { id: string; shortName: string; count: number }>();
    positions.forEach((position) => {
      const route = position.routeId ? routeIndex.get(position.routeId) : undefined;
      const id = route?.id ?? position.routeId ?? "unknown";
      const shortName = position.routeShortName ?? route?.shortName ?? "Unknown";
      const existing = counts.get(id);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(id, { id, shortName, count: 1 });
      }
    });
    return Array.from(counts.values()).sort((a, b) => a.shortName.localeCompare(b.shortName));
  }, [positions, routeIndex]);

  const loading = routesQuery.isLoading || positionsQuery.isLoading;
  const error = routesQuery.error ?? positionsQuery.error;

  return (
    <div className="flex flex-col h-full">
      <header className="bg-blue-600 text-white shadow-md">
        <div className="flex items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold">Bus Tracker</h1>
          <button
            onClick={() => setPanelOpen(true)}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 rounded text-sm font-medium transition-colors"
          >
            Panel
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar Drawer */}
        <div
          className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${
            panelOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setPanelOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-72 bg-white shadow-lg transform transition-transform z-50 ${
            panelOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
            <p className="text-sm text-gray-600 mt-1">Vehicles: {positions.length}</p>
            <p className="text-sm text-gray-600">Routes: {routes.length}</p>
          </div>
          <div className="border-t border-gray-200" />
          <nav className="overflow-y-auto">
            <ul className="divide-y divide-gray-200">
              {routeSummaries.map((route) => (
                <li key={route.id} className="px-4 py-3 hover:bg-gray-50">
                  <p className="font-medium text-gray-900">{route.shortName}</p>
                  <p className="text-xs text-gray-500">
                    {route.count} vehicle{route.count === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 relative min-w-0">
          {error && (
            <div className="absolute top-0 left-0 right-0 p-4 bg-red-50 border-l-4 border-red-400 z-10">
              <p className="text-red-700 text-sm">{getErrorMessage(error)}</p>
            </div>
          )}
          {loading ? (
            <div className="h-full flex items-center justify-center bg-gray-100">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          ) : (
            <MapView positions={positions} routes={routes} />
          )}
        </div>
      </div>
    </div>
  );
}
