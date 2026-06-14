import { useEffect, useRef } from "react";
import type { Stop } from "../api/types";
import { SkeletonCard } from "./Skeleton";

interface NearbyStopsPanelProps {
  stops: Stop[];
  isLoading: boolean;
  focusedIndex: number | null;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  onFocusChange: (index: number | null) => void;
}

export default function NearbyStopsPanel({
  stops,
  isLoading,
  focusedIndex,
  selectedStopId,
  onSelectStop,
  onFocusChange,
}: NearbyStopsPanelProps) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, stops.length);
  }, [stops.length]);

  useEffect(() => {
    if (focusedIndex !== null && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

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
          <div className="font-semibold text-gray-800 mb-1.5">Nearby Stops ({stops.length})</div>
          {stops.slice(0, 5).map((stop, index) => {
            const isFocused = focusedIndex === index;
            const isSelected = selectedStopId === stop.stopId;

            return (
              <div
                key={stop.stopId}
                ref={(el) => { itemRefs.current[index] = el; }}
                role="button"
                tabIndex={isFocused ? 0 : -1}
                aria-selected={isSelected}
                className={`truncate cursor-pointer rounded px-1.5 py-1 transition-colors ${
                  isSelected
                    ? "bg-blue-100 text-blue-800 font-medium"
                    : isFocused
                      ? "bg-gray-100 text-gray-800"
                      : "text-gray-600 hover:bg-gray-50"
                }`}
                onClick={() => onSelectStop(stop.stopId)}
                onMouseEnter={() => onFocusChange(index)}
                onMouseLeave={() => onFocusChange(null)}
              >
                {stop.stopName ?? stop.stopId} — {stop.distanceM.toFixed(0)}m
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
