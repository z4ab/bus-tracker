import { useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { VehicleArrivalStop } from "../api/types";
import { buildStopMarkerHtml } from "./StopMarker";

const formatMinutes = (minutes: number) => {
  if (minutes <= 0) {
    return "due";
  }
  return `${minutes} min`;
};

interface TripStopMarkerProps {
  stop: VehicleArrivalStop & { minutesAway: number; stopLat: number; stopLon: number };
  index: number;
}

export default function TripStopMarker({ stop, index }: TripStopMarkerProps) {
  const iconCache = useRef(new Map<string, L.DivIcon>());

  const getStopIcon = (label: string) => {
    const cached = iconCache.current.get(label);
    if (cached) {
      return cached;
    }

    const icon = L.divIcon({
      className: "stop-marker",
      html: buildStopMarkerHtml(label),
      iconSize: [60, 24],
      iconAnchor: [6, 12],
    });

    iconCache.current.set(label, icon);
    return icon;
  };

  const label = formatMinutes(stop.minutesAway);
  const icon = getStopIcon(label);

  return (
    <Marker position={[stop.stopLat, stop.stopLon]} icon={icon} zIndexOffset={300}>
      <Popup>
        <div className="text-sm">
          <div className="font-semibold text-gray-900">
            {stop.stopName ?? stop.stopId ?? "Stop"}
          </div>
          <div className="text-gray-600">{label} away</div>
        </div>
      </Popup>
    </Marker>
  );
}
