import { useEffect, useRef, useState } from "react";
import type { Stop } from "../api/types";
import { useStopSearch } from "../hooks/useStopSearch";
import { SkeletonCard } from "./Skeleton";

interface NearbyStopsPanelProps {
  stops: Stop[];
  isLoading: boolean;
  focusedIndex: number | null;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  onFocusChange: (index: number | null) => void;
}

function SearchResults({
  query,
  selectedStopId,
  onSelectStop,
}: {
  query: string;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
}) {
  const { data: results, isLoading } = useStopSearch(query);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={1} />
      </div>
    );
  }

  if (!results || results.length === 0) {
    return <p className="text-gray-500 italic text-xs">No stops match your search.</p>;
  }

  return (
    <>
      <div className="font-semibold text-gray-800 mb-1.5 text-sm">
        Search Results ({results.length})
      </div>
      {results.slice(0, 5).map((stop) => {
        const isSelected = selectedStopId === stop.stopId;
        return (
          <div
            key={stop.stopId}
            role="button"
            tabIndex={0}
            aria-selected={isSelected}
            className={`truncate cursor-pointer rounded px-1.5 py-1 transition-colors text-xs ${
              isSelected
                ? "bg-blue-100 text-blue-800 font-medium"
                : "text-gray-600 hover:bg-gray-50"
            }`}
            onClick={() => onSelectStop(stop.stopId)}
          >
            {stop.stopName ?? stop.stopId}
          </div>
        );
      })}
    </>
  );
}

export default function NearbyStopsPanel({
  stops,
  isLoading,
  focusedIndex,
  selectedStopId,
  onSelectStop,
  onFocusChange,
}: NearbyStopsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, stops.length);
  }, [stops.length]);

  useEffect(() => {
    if (focusedIndex !== null && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const showSearch = searchQuery.trim().length >= 2;

  return (
    <div className="px-4 py-3">
      {/* Search input */}
      <input
        type="text"
        placeholder="Search stops…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent mb-3"
      />

      {showSearch ? (
        <SearchResults
          query={searchQuery}
          selectedStopId={selectedStopId}
          onSelectStop={onSelectStop}
        />
      ) : isLoading ? (
        <>
          <div className="font-semibold text-gray-800 mb-2 text-sm">Nearby Stops</div>
          <div className="space-y-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={1} />
          </div>
        </>
      ) : stops.length === 0 ? (
        <div>
          <div className="font-semibold text-gray-800 mb-1 text-sm">Nearby Stops</div>
          <p className="text-gray-500 italic text-xs">
            No stops found nearby — try panning the map or searching by name
          </p>
        </div>
      ) : (
        <>
          <div className="font-semibold text-gray-800 mb-1.5 text-sm">
            Nearby Stops ({stops.length})
          </div>
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
                className={`truncate cursor-pointer rounded px-1.5 py-1 transition-colors text-xs ${
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
