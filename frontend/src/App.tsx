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
    <div className="flex h-screen">
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
  );
}
