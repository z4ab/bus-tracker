import { useEffect, useRef } from "react";
import { Marker, useMap } from "react-leaflet";
import { renderToString } from "react-dom/server";
import L from "leaflet";

const SelectedVehicleIcon = ({ color }: { color: string }) => (
  <div className="relative flex items-center justify-center">
    <div className="absolute w-8 h-8 rounded-full opacity-30" style={{ backgroundColor: color }} />
    <div
      className="w-5 h-5 rounded-full border-[3px] border-white shadow-lg"
      style={{ backgroundColor: color }}
    />
  </div>
);

const buildHtml = (color: string) => renderToString(<SelectedVehicleIcon color={color} />);

const bearingToDirection = (bearing: number): string => {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
};

const formatRelativeTime = (isoString: string): string => {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 0) return "0s ago";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

interface SelectedVehicleMarkerProps {
  position: [number, number];
  color?: string;
  shortName?: string;
  transportType?: "bus" | "lrt";
  heading?: number;
  speed?: number;
  updatedAt?: string;
}

export default function SelectedVehicleMarker({
  position,
  color,
  shortName,
  transportType,
  heading,
  speed,
  updatedAt,
}: SelectedVehicleMarkerProps) {
  const map = useMap();
  const popupRef = useRef<L.Popup | null>(null);

  const iconCache = useRef(new Map<string, L.DivIcon>());
  const cacheKey = color ?? "#1976d2";
  const cached = iconCache.current.get(cacheKey);
  const icon =
    cached ??
    L.divIcon({
      className: "selected-vehicle-marker",
      html: buildHtml(cacheKey),
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  if (!cached) {
    iconCache.current.set(cacheKey, icon);
  }

  useEffect(() => {
    const transportLabel = transportType === "lrt" ? "LRT" : "Bus";
    const headingLabel = heading !== undefined ? bearingToDirection(heading) : undefined;
    const speedKmh = speed !== undefined ? Math.round(speed) : undefined;

    const popupContent = `
      <div class="min-w-[180px]">
        <div class="flex items-center gap-2 mb-2">
          ${
            shortName
              ? `<div class="flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold" style="background-color: ${color ?? "#1976d2"}">${shortName}</div>`
              : ""
          }
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">${transportLabel}</span>
        </div>
        <div class="space-y-1 text-sm">
          ${
            headingLabel !== undefined
              ? `<div class="flex justify-between"><span class="text-gray-500">Heading</span><span class="font-medium">${headingLabel}</span></div>`
              : ""
          }
          ${
            speedKmh !== undefined
              ? `<div class="flex justify-between"><span class="text-gray-500">Speed</span><span class="font-medium">${speedKmh} km/h</span></div>`
              : ""
          }
          ${
            updatedAt
              ? `<div class="flex justify-between"><span class="text-gray-500">Updated</span><span class="font-medium">${formatRelativeTime(updatedAt)}</span></div>`
              : ""
          }
        </div>
      </div>
    `;

    if (popupRef.current) {
      map.removeLayer(popupRef.current);
    }

    const popup = L.popup({
      closeButton: true,
      autoClose: true,
      closeOnEscapeKey: true,
      offset: [0, -16],
    })
      .setLatLng(position)
      .setContent(popupContent)
      .openOn(map);

    popupRef.current = popup;

    return () => {
      if (popupRef.current) {
        map.removeLayer(popupRef.current);
        popupRef.current = null;
      }
    };
  }, [map, position, color, shortName, transportType, heading, speed, updatedAt]);

  return <Marker position={position} icon={icon} zIndexOffset={1000} />;
}
