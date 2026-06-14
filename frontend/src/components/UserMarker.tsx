import { useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import { renderToString } from "react-dom/server";
import L from "leaflet";

const CACHE_MAX = 500;

const UserLocationMarkerIcon = () => (
  <div className="relative flex items-center justify-center">
    <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md" />
    <div className="absolute w-8 h-8 border-2 border-blue-400 rounded-full animate-pulse" />
  </div>
);

const buildUserLocationMarkerHtml = () => {
  return renderToString(<UserLocationMarkerIcon />);
};

interface UserMarkerProps {
  position: [number, number];
}

export default function UserMarker({ position }: UserMarkerProps) {
  const iconCache = useRef(new Map<string, L.DivIcon>());

  const getIcon = () => {
    const cacheKey = "user-location";
    const cached = iconCache.current.get(cacheKey);
    if (cached) {
      // Promote to most recently used
      iconCache.current.delete(cacheKey);
      iconCache.current.set(cacheKey, cached);
      return cached;
    }

    const icon = L.divIcon({
      className: "user-location-marker",
      html: buildUserLocationMarkerHtml(),
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    iconCache.current.set(cacheKey, icon);
    // Evict oldest entry if over capacity
    if (iconCache.current.size > CACHE_MAX) {
      const firstKey = iconCache.current.keys().next().value;
      if (firstKey !== undefined) {
        iconCache.current.delete(firstKey);
      }
    }
    return icon;
  };

  return (
    <Marker position={position} icon={getIcon()} zIndexOffset={400}>
      <Popup>
        <div className="text-sm">
          <div className="font-semibold text-gray-900">Your Location</div>
          <div className="text-gray-600">
            {position[0].toFixed(4)}, {position[1].toFixed(4)}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
