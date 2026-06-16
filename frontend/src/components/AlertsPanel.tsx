import type { Alert } from "../api/types";

interface AlertsPanelProps {
  alerts: Alert[];
  isLoading: boolean;
}

const getSeverityColor = (effect?: string): string => {
  if (!effect) return "border-l-amber-400";
  const severe = ["NO_SERVICE", "STOP_MOVE", "SIGNIFICANT_DELAYS", "DETOUR"];
  return severe.includes(effect) ? "border-l-red-400" : "border-l-amber-400";
};

export default function AlertsPanel({ alerts, isLoading }: AlertsPanelProps) {
  if (isLoading) {
    return (
      <div className="px-4 py-3">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="px-4 py-3">
        <p className="text-gray-500 italic text-xs">No active alerts.</p>
      </div>
    );
  }

  return (
    <div className="px-2 py-3 space-y-2">
      {alerts.map((alert, idx) => (
        <div
          key={alert.alertId ?? idx}
          className={`border-l-4 ${getSeverityColor(alert.effect)} bg-white rounded-r-md px-3 py-2 shadow-sm`}
        >
          <div className="text-sm font-medium text-gray-900">{alert.headerText}</div>
          {alert.descriptionText && (
            <div className="text-xs text-gray-600 mt-0.5">{alert.descriptionText}</div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {alert.effect && (
              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {alert.effect.replace(/_/g, " ")}
              </span>
            )}
            {alert.routeIds.slice(0, 5).map((rid) => (
              <span
                key={rid}
                className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
              >
                {rid}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
