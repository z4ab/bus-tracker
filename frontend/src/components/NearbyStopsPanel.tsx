import type { Stop } from "../api/types";

interface NearbyStopsPanelProps {
  stops: Stop[];
}

export default function NearbyStopsPanel({ stops }: NearbyStopsPanelProps) {
  if (stops.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow-lg p-3 text-xs max-w-64 max-h-48 overflow-y-auto">
      <div className="font-semibold text-gray-800 mb-1">Nearby Stops ({stops.length})</div>
      {stops.slice(0, 5).map((stop) => (
        <div key={stop.stopId} className="text-gray-600 truncate">
          {stop.stopName ?? stop.stopId} — {stop.distanceM.toFixed(0)}m
        </div>
      ))}
    </div>
  );
}
