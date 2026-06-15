import { renderToString } from "react-dom/server";

export const StopMarkerIcon = ({ label }: { label: string }) => (
  <div className="flex items-center gap-1.5" style={{ transform: "translate(-6px, -6px)" }}>
    <div className="w-3 h-3 rounded-full border-2 border-blue-600 bg-white shadow-sm" />
    <div className="whitespace-nowrap rounded-md bg-white text-gray-900 text-xs font-semibold px-1.5 py-0.5 shadow-sm">
      {label}
    </div>
  </div>
);

export const PassedStopMarkerIcon = ({ label }: { label: string }) => (
  <div className="flex items-center gap-1.5" style={{ transform: "translate(-6px, -6px)" }}>
    <div className="w-3 h-3 rounded-full border-2 border-gray-400 bg-gray-200 shadow-sm flex items-center justify-center">
      <svg
        className="w-2 h-2 text-gray-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <div className="whitespace-nowrap rounded-md bg-gray-100 text-gray-400 text-xs font-semibold px-1.5 py-0.5 shadow-sm line-through">
      {label}
    </div>
  </div>
);

export const buildStopMarkerHtml = (label: string) => {
  return renderToString(<StopMarkerIcon label={label} />);
};

export const buildPassedStopMarkerHtml = (label: string) => {
  return renderToString(<PassedStopMarkerIcon label={label} />);
};
