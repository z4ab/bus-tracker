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
  heading,
}: {
  shortName: string;
  color: string;
  textColor: string;
  transportType?: "bus" | "lrt";
  heading?: number;
}) => {
  const isLrt = transportType === "lrt";
  return (
    <div className="relative">
      {heading !== undefined && heading !== null && (
        <div
          className="absolute left-1/2 -top-3 z-10 w-0 h-0"
          style={{
            marginLeft: "-5px",
            transform: `rotate(${heading}deg)`,
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderBottom: "8px solid " + color,
            }}
          />
        </div>
      )}
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
  transportType?: "bus" | "lrt",
  heading?: number
) => {
  return renderToString(
    <RouteMarker
      shortName={shortName}
      color={color}
      textColor={textColor}
      transportType={transportType}
      heading={heading}
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
  const heading = position.heading;

  const getMarkerIcon = () => {
    const cacheKey = `${shortName}-${color}-${textColor}-${transportType ?? ""}-${heading ?? ""}`;
    const cached = iconCache.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const icon = L.divIcon({
      className: "route-marker",
      html: buildMarkerHtml(shortName, color, textColor, transportType, heading),
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
