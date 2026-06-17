import { useMemo, useState } from "react";
import type { Route } from "../api/types";

interface RouteListPanelProps {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string | null) => void;
  vehicleCountsByRoute: Record<string, number>;
}

export default function RouteListPanel({
  routes,
  selectedRouteId,
  onSelectRoute,
  vehicleCountsByRoute,
}: RouteListPanelProps) {
  const [search, setSearch] = useState("");

  const filteredRoutes = useMemo(() => {
    if (!search.trim()) return routes;
    const q = search.toLowerCase();
    return routes.filter(
      (route) =>
        route.shortName.toLowerCase().includes(q) ||
        (route.longName && route.longName.toLowerCase().includes(q))
    );
  }, [routes, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-4 pt-3 pb-2">
        <input
          type="text"
          placeholder="Search routes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
      </div>

      {/* Route list */}
      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {filteredRoutes.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            {search ? "No routes match your search." : "No routes available."}
          </p>
        ) : (
          <div className="space-y-0.5">
            {filteredRoutes.map((route) => {
              const isSelected = route.id === selectedRouteId;
              return (
                <button
                  key={route.id}
                  onClick={() => onSelectRoute(isSelected ? null : route.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-left transition-colors ${
                    isSelected
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span
                    className="inline-block w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                    style={{ backgroundColor: route.color ?? "#6b7280" }}
                  />
                  <span className="font-medium">{route.shortName}</span>
                  {route.longName && (
                    <span className="text-gray-500 truncate">{route.longName}</span>
                  )}
                  <span className="ml-auto text-xs text-gray-400 tabular-nums">
                    {vehicleCountsByRoute[route.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
