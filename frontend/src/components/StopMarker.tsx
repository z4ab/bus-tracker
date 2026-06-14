import { renderToString } from "react-dom/server";

export const StopMarkerIcon = ({ label }: { label: string }) => (
  <div className="flex items-center gap-1.5" style={{ transform: "translate(-6px, -6px)" }}>
    <div className="w-3 h-3 rounded-full border-2 border-blue-600 bg-white shadow-sm" />
    <div className="whitespace-nowrap rounded-md bg-white text-gray-900 text-xs font-semibold px-1.5 py-0.5 shadow-sm">
      {label}
    </div>
  </div>
);

export const buildStopMarkerHtml = (label: string) => {
  return renderToString(<StopMarkerIcon label={label} />);
};
