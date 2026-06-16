import { useMemo } from "react";
import type { VehicleArrivalStop } from "../api/types";

interface TripTimelinePanelProps {
  stops: VehicleArrivalStop[];
  isLoading: boolean;
  routeShortName?: string;
  routeColor?: string;
  vehicleId: string;
}

type TimelineStop = VehicleArrivalStop & {
  predictedTime: number;
  minutesAway: number;
  passed: boolean;
};

const formatTime = (timestamp: number | undefined): string => {
  if (!timestamp) return "--";
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatMinutes = (minutes: number): string => {
  if (minutes <= 0) return "due";
  return `${minutes} min`;
};

export default function TripTimelinePanel({
  stops,
  isLoading,
  routeShortName,
  routeColor,
  vehicleId,
}: TripTimelinePanelProps) {
  const timelineStops = useMemo<TimelineStop[]>(() => {
    const nowSeconds = Date.now() / 1000;
    return stops
      .map((stop) => {
        const predictedTime = stop.arrivalTime ?? stop.departureTime ?? null;
        if (!predictedTime) return null;
        const minutesAway = Math.round((predictedTime - nowSeconds) / 60);
        return {
          ...stop,
          predictedTime,
          minutesAway,
          passed: predictedTime < nowSeconds,
        };
      })
      .filter((s): s is TimelineStop => s !== null)
      .sort((a, b) => a.predictedTime - b.predictedTime)
      .slice(0, 10);
  }, [stops]);

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500">Loading trip timeline…</div>
    );
  }

  if (timelineStops.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500">
        No upcoming stops available.
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          {routeShortName && (
            <span
              className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold text-white"
              style={{ backgroundColor: routeColor ? `#${routeColor}` : "#6b7280" }}
            >
              {routeShortName}
            </span>
          )}
          <h3 className="text-sm font-semibold text-gray-900">Trip Timeline</h3>
        </div>
        <p className="mt-1 text-xs text-gray-500">Vehicle {vehicleId}</p>
      </div>

      {/* Timeline stops */}
      <div className="relative">
        {timelineStops.map((stop, index) => {
          const isLast = index === timelineStops.length - 1;
          const passed = stop.passed;

          let dotColor: string;
          if (passed) {
            dotColor = "bg-gray-300";
          } else if (stop.minutesAway <= 5) {
            dotColor = "bg-green-500";
          } else if (stop.minutesAway <= 15) {
            dotColor = "bg-amber-500";
          } else {
            dotColor = "bg-blue-400";
          }

          let minutesColor: string;
          if (stop.minutesAway <= 5) {
            minutesColor = "text-green-600";
          } else if (stop.minutesAway <= 15) {
            minutesColor = "text-amber-600";
          } else {
            minutesColor = "text-gray-500";
          }

          return (
            <div className="flex" key={`${stop.stopId ?? "stop"}-${stop.stopSequence ?? index}`}>
              {/* Timeline column */}
              <div className="flex flex-col items-center mr-3">
                {/* Dot */}
                <div
                  className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${
                    passed ? "bg-gray-300 ring-2 ring-white" : dotColor
                  }`}
                />
                {/* Connecting line */}
                {!isLast && <div className="w-0.5 flex-1 bg-gray-200 min-h-[24px]" />}
              </div>

              {/* Stop info column */}
              <div className={`flex-1 pb-6 ${isLast ? "pb-0" : ""}`}>
                <div
                  className={`text-sm ${passed ? "text-gray-400 line-through" : "text-gray-900"}`}
                >
                  {stop.stopName ?? "Unknown stop"}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {!passed ? (
                    <span className={`text-xs font-medium ${minutesColor}`}>
                      {formatMinutes(stop.minutesAway)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Passed</span>
                  )}
                  <span className="text-xs text-gray-400">{formatTime(stop.predictedTime)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
