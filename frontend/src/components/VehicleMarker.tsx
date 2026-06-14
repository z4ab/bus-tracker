import { useRef } from "react";
import { Marker } from "react-leaflet";
import { renderToString } from "react-dom/server";
import L from "leaflet";
import type { Route, VehiclePosition } from "../api/types";

const RouteMarker = ({
  shortName,
  color,
  textColor,
  transportType,
}: {
  shortName: string;
  color: string;
  textColor: string;
  transportType?: "bus" | "lrt";
}) => {
  const isLrt = transportType === "lrt";
  return (
    <div className="relative">
      <div
        className={`w-8 h-8 flex items-center justify-center rounded-full border-2 font-bold text-xs shadow-md ${
          isLrt ? "border-amber-400" : "border-white"
        }`}
        style={{
          backgroundColor: color,
          color: textColor,
        }}
      >
        {shortName}
      </div>
      {isLrt && (
        <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-[9px] font-bold px-1 rounded-sm shadow-sm leading-tight">
          LRT
        </div>
      )}
    </div>
  );
};

const buildMarkerHtml = (
  shortName: string,
  color: string,
  textColor: string,
  transportType?: "bus" | "lrt"
) => {
  return renderToString(
    <RouteMarker
      shortName={shortName}
      color={color}
      textColor={textColor}
      transportType={transportType}
    />
  );
};

interface VehicleMarkerProps {
  position: VehiclePosition;
  routeIndex: Map<string, Route>;
  onSelect: (vehicleId: string, routeId: string | undefined) => void;
}

export default function VehicleMarker({ position, routeIndex, onSelect }: VehicleMarkerProps) {
  const iconCache = useRef(new Map<string, L.DivIcon>());

  const route = position.routeId ? routeIndex.get(position.routeId) : undefined;
  const shortName = position.routeShortName ?? route?.shortName ?? "?";
  const color = position.routeColor ?? route?.color ?? "#1976d2";
  const textColor = route?.textColor ?? "#ffffff";
  const transportType = position.transportType;

  const getMarkerIcon = () => {
    const cacheKey = `${shortName}-${color}-${textColor}-${transportType ?? ""}`;
    const cached = iconCache.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const icon = L.divIcon({
      className: "route-marker",
      html: buildMarkerHtml(shortName, color, textColor, transportType),
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    iconCache.current.set(cacheKey, icon);
    return icon;
  };

  const icon = getMarkerIcon();

  return (
    <Marker
      position={[position.lat, position.lon]}
      icon={icon}
      eventHandlers={{
        click: () => {
          onSelect(position.id, position.routeId);
        },
      }}
    />
  );
}
