import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import L, { Control } from "leaflet";

// ── LocateControl ───────────────────────────────────────────────────────────

class LocateControl extends Control {
  private onLocate: (() => void) | null = null;
  private isDisabled = true;

  setOnLocate(callback: () => void, isDisabled: boolean) {
    this.onLocate = callback;
    this.isDisabled = isDisabled;
    if (this._button) {
      this._button.disabled = isDisabled;
    }
  }

  private _button: HTMLButtonElement | null = null;

  onAdd() {
    const container = L.DomUtil.create("div", "leaflet-control leaflet-bar");
    this._button = L.DomUtil.create("button", "", container) as HTMLButtonElement;
    this._button.type = "button";
    this._button.disabled = this.isDisabled;
    this._button.title = "Zoom to your location";
    this._button.className =
      "bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 transition flex items-center justify-center w-9 h-9";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "w-5 h-5");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("viewBox", "0 0 24 24");

    const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p1.setAttribute("stroke-linecap", "round");
    p1.setAttribute("stroke-linejoin", "round");
    p1.setAttribute("stroke-width", "2");
    p1.setAttribute(
      "d",
      "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
    );
    const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p2.setAttribute("stroke-linecap", "round");
    p2.setAttribute("stroke-linejoin", "round");
    p2.setAttribute("stroke-width", "2");
    p2.setAttribute("d", "M15 11a3 3 0 11-6 0 3 3 0 016 0z");

    svg.appendChild(p1);
    svg.appendChild(p2);
    this._button.appendChild(svg);

    L.DomEvent.on(this._button, "click", () => {
      if (this.onLocate && !this.isDisabled) {
        this.onLocate();
      }
    });

    L.DomEvent.disableClickPropagation(this._button);
    return container;
  }

  onRemove() {
    this._button = null;
  }
}

// ── Debounce utility ────────────────────────────────────────────────────────

function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── MapBindings props ───────────────────────────────────────────────────────

interface MapBindingsProps {
  mapRef: React.MutableRefObject<L.Map | null>;
  /** Called (debounced by 1 s) when the map center changes significantly. */
  onCenterChange?: (lat: number, lon: number) => void;
  onZoomToLocation: () => void;
  userLocationEnabled: boolean;
}

/**
 * Renders nothing — sits inside <MapContainer> to capture the map instance
 * and attach Leaflet controls / event listeners.
 *
 * The `onCenterChange` callback is debounced by 1 second so that rapid
 * panning doesn't trigger a flood of upstream work (e.g. fetching nearby
 * stops).
 */
export default function MapBindings({
  mapRef,
  onCenterChange,
  onZoomToLocation,
  userLocationEnabled,
}: MapBindingsProps) {
  const map = useMap();
  const controlRef = useRef<LocateControl | null>(null);

  // Capture the map ref
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  // Debounced center change handler
  const debouncedCenterChange = useRef(
    onCenterChange
      ? debounce((lat: number, lon: number) => {
          onCenterChange(lat, lon);
        }, 1000)
      : null
  ).current;

  // Attach moveend listener for nearby-stops fetching
  useEffect(() => {
    if (!debouncedCenterChange) return;

    const handleMoveEnd = () => {
      const center = map.getCenter();
      debouncedCenterChange(center.lat, center.lng);
    };

    map.on("moveend", handleMoveEnd);
    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [map, debouncedCenterChange]);

  // Locate control
  useEffect(() => {
    if (!map) return;

    if (!controlRef.current) {
      const control = new LocateControl({ position: "topright" });
      control.addTo(map);
      controlRef.current = control;
    }

    if (controlRef.current) {
      controlRef.current.setOnLocate(onZoomToLocation, !userLocationEnabled);
    }
  }, [map, onZoomToLocation, userLocationEnabled]);

  return null;
}
