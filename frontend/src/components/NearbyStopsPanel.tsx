import { useEffect, useRef } from "react";
import type { Stop } from "../api/types";

interface NearbyStopsPanelProps {
  stops: Stop[];
  focusedIndex: number | null;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  onFocusChange: (index: number | null) => void;
}

export default function NearbyStopsPanel({
  stops,
  focusedIndex,
  selectedStopId,
  onSelectStop,
  onFocusChange,
}: NearbyStopsPanelProps) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Ensure ref array length matches stops
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, stops.length);
  }, [stops.length]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex !== null && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  if (stops.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow-lg p-3 text-xs max-w-64 max-h-48 overflow-y-auto">
      <div className="font-semibold text-gray-800 mb-1.5">Nearby Stops ({stops.length})</div>
      {stops.slice(0, 5).map((stop, index) => {
        const isFocused = focusedIndex === index;
        const isSelected = selectedStopId === stop.stopId;

        return (
          <div
            key={stop.stopId}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
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
    </div>
  );
}
