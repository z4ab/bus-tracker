import type { Stop } from "../api/types";
import { SkeletonCard } from "./Skeleton";

interface NearbyStopsPanelProps {
  stops: Stop[];
  isLoading: boolean;
}

export default function NearbyStopsPanel({ stops, isLoading }: NearbyStopsPanelProps) {
  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow-lg p-3 text-xs max-w-64 max-h-48 overflow-y-auto">
      {isLoading ? (
        <>
          <div className="font-semibold text-gray-800 mb-2">Nearby Stops</div>
          <div className="space-y-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={1} />
          </div>
        </>
      ) : stops.length === 0 ? (
        <>
          <div className="font-semibold text-gray-800 mb-1">Nearby Stops</div>
          <p className="text-gray-500 italic">No stops found nearby — try panning the map</p>
        </>
      ) : (
        <>
          <div className="font-semibold text-gray-800 mb-1">Nearby Stops ({stops.length})</div>
          {stops.slice(0, 5).map((stop) => (
            <div key={stop.stopId} className="text-gray-600 truncate">
              {stop.stopName ?? stop.stopId} — {stop.distanceM.toFixed(0)}m
            </div>
          ))}
        </>
      )}
    </div>
  );
}
