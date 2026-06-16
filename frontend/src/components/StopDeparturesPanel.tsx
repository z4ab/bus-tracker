import type { Departure } from "../hooks/useStopDepartures";

interface StopDeparturesPanelProps {
  departures: Departure[];
  isLoading: boolean;
}

const formatMinutes = (minutes: number | undefined): string => {
  if (minutes === undefined || minutes === null) return "--";
  if (minutes <= 0) return "Due";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
};

export default function StopDeparturesPanel({ departures, isLoading }: StopDeparturesPanelProps) {
  if (isLoading) {
    return (
      <div className="px-4 py-2 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-700 mb-2">Departures</div>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (departures.length === 0) {
    return (
      <div className="px-4 py-2 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-700 mb-1">Departures</div>
        <p className="text-gray-500 italic text-xs">No upcoming departures.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 border-t border-gray-100">
      <div className="text-xs font-semibold text-gray-700 mb-1.5">
        Departures ({departures.length})
      </div>
      <div className="space-y-1">
        {departures.slice(0, 8).map((dep, idx) => (
          <div key={`${dep.tripId}-${idx}`} className="flex items-center gap-2 text-xs py-0.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: dep.routeColor ?? "#6b7280" }}
            />
            <span className="font-medium text-gray-800 w-10 shrink-0">
              {dep.routeShortName ?? dep.routeId}
            </span>
            <span className="text-gray-900 font-semibold w-14 shrink-0 text-right">
              {formatMinutes(dep.minutesAway)}
            </span>
            <span className="text-gray-400">
              {dep.type === "predicted" ? "✓ live" : "• scheduled"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
