import type { Route, VehiclePosition } from "../api/types";

interface SidebarProps {
  routes: Route[];
  positions: VehiclePosition[];
  loading: boolean;
}

export default function Sidebar({ routes, positions, loading }: SidebarProps) {
  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Bus Tracker</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="text-sm text-gray-500">Loading routes…</div>
        ) : (
          <>
            <div className="text-sm text-gray-500">
              {positions.length} vehicle{positions.length !== 1 ? "s" : ""} tracked
            </div>
            <div className="space-y-1">
              {routes.map((route) => (
                <div key={route.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: route.color ?? "#6b7280" }}
                  />
                  <span>{route.shortName}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 text-xs text-gray-400">
        v{__APP_VERSION__}
      </div>
    </div>
  );
}
