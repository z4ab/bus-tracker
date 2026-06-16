import { useState } from "react";
import type { Route, VehiclePosition } from "../api/types";
import RouteListPanel from "./RouteListPanel";

interface SidebarProps {
  routes: Route[];
  positions: VehiclePosition[];
  loading: boolean;
  onSelectRoute: (routeId: string | null) => void;
  selectedRouteId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

type Tab = "stops" | "routes";

export default function Sidebar({
  routes,
  positions,
  loading,
  onSelectRoute,
  selectedRouteId,
  isOpen,
  onToggle,
  children,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("stops");

  return (
    <>
      {/* Backdrop overlay on mobile when sidebar is open */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 md:fixed lg:hidden" onClick={onToggle} />
      )}

      {/* Hamburger toggle button — floats over map on md and below */}
      <button
        onClick={onToggle}
        className="fixed top-3 left-3 z-40 p-2 rounded-md bg-white/80 hover:bg-white shadow hover:shadow-md transition-all duration-200 text-gray-600 hover:text-blue-600 md:fixed lg:hidden"
        title={isOpen ? "Close sidebar" : "Open sidebar"}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Sidebar panel */}
      <div
        className={`
          w-72 bg-white border-r border-gray-200 flex flex-col h-full shrink-0
          fixed md:fixed lg:static top-0 left-0 z-30
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static
        `}
      >
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
    </>
  );
}
