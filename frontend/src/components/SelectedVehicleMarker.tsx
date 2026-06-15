import { useRef } from "react";
import { Marker } from "react-leaflet";
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

interface SelectedVehicleMarkerProps {
  position: [number, number];
  color?: string;
}

export default function SelectedVehicleMarker({ position, color }: SelectedVehicleMarkerProps) {
  const iconCache = useRef(new Map<string, L.DivIcon>());

  const cacheKey = color ?? "#1976d2";
  let icon = iconCache.current.get(cacheKey);
  if (!icon) {
    icon = L.divIcon({
      className: "selected-vehicle-marker",
      html: buildHtml(cacheKey),
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    iconCache.current.set(cacheKey, icon);
  }

  return <Marker position={position} icon={icon} zIndexOffset={1000} />;
}
