import { useState } from "react";
import type { Route, VehiclePosition } from "../api/types";
import RouteListPanel from "./RouteListPanel";

interface SidebarProps {
  routes: Route[];
  positions: VehiclePosition[];
  loading: boolean;
  onSelectRoute: (routeId: string | null) => void;
  selectedRouteId: string | null;
  children?: React.ReactNode;
}

type Tab = "stops" | "routes";

export default function Sidebar({
  routes,
  positions,
  loading,
  onSelectRoute,
  selectedRouteId,
  children,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("stops");

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Bus Tracker</h1>
        {!loading && (
          <div className="text-xs text-gray-500 mt-0.5">
            {positions.length} vehicle{positions.length !== 1 ? "s" : ""} tracked
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("stops")}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "stops"
              ? "text-blue-600 border-b-2 border-blue-500"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Stops
        </button>
        <button
          onClick={() => setActiveTab("routes")}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "routes"
              ? "text-blue-600 border-b-2 border-blue-500"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Routes
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "stops" ? (
          loading ? (
            <div className="px-4 py-3 text-sm text-gray-500">Loading…</div>
          ) : (
            children
          )
        ) : (
          <RouteListPanel
            routes={routes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={onSelectRoute}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 text-xs text-gray-400">
        v{__APP_VERSION__}
      </div>
    </div>
  );
}
