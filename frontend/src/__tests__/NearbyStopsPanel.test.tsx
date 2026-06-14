import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import NearbyStopsPanel from "../components/NearbyStopsPanel";
import type { Stop } from "../api/types";

const makeStop = (overrides: Partial<Stop> = {}): Stop => ({
  stopId: "stop-1",
  stopName: "Main St & King St",
  stopLat: 43.45,
  stopLon: -80.49,
  distanceM: 120,
  ...overrides,
});

const defaultProps = {
  isLoading: false,
  focusedIndex: null as number | null,
  selectedStopId: null as string | null,
  onSelectStop: () => {},
  onFocusChange: () => {},
};

describe("NearbyStopsPanel", () => {
  it("shows empty state when stops array is empty", () => {
    render(<NearbyStopsPanel stops={[]} {...defaultProps} />);
    expect(screen.getByText("No stops found nearby — try panning the map")).toBeInTheDocument();
  });

  it("renders the count of nearby stops", () => {
    const stops = [makeStop()];
    render(<NearbyStopsPanel stops={stops} {...defaultProps} />);
    expect(screen.getByText("Nearby Stops (1)")).toBeInTheDocument();
  });

  it("renders each stop with name and distance", () => {
    const stops = [
      makeStop({ stopId: "s1", stopName: "King & Weber", distanceM: 50 }),
      makeStop({ stopId: "s2", stopName: "University & Bridge", distanceM: 200 }),
    ];
    render(<NearbyStopsPanel stops={stops} {...defaultProps} />);
    expect(screen.getByText(/King & Weber/)).toBeInTheDocument();
    expect(screen.getByText(/50m/)).toBeInTheDocument();
    expect(screen.getByText(/University & Bridge/)).toBeInTheDocument();
    expect(screen.getByText(/200m/)).toBeInTheDocument();
  });

  it("falls back to stopId when stopName is missing", () => {
    const stops = [makeStop({ stopName: undefined })];
    render(<NearbyStopsPanel stops={stops} {...defaultProps} />);
    expect(screen.getByText(/stop-1/)).toBeInTheDocument();
  });

  it("only shows up to 5 stops", () => {
    const stops = Array.from({ length: 10 }, (_, i) =>
      makeStop({ stopId: `s${i}`, stopName: `Stop ${i}`, distanceM: i * 10 })
    );
    render(<NearbyStopsPanel stops={stops} {...defaultProps} />);
    expect(screen.getByText("Nearby Stops (10)")).toBeInTheDocument();
    // Only 5 stop entries should be rendered (sliced in component)
    expect(screen.getAllByText(/Stop \d+/)).toHaveLength(5);
  });

  it("renders distance with zero decimals", () => {
    const stops = [makeStop({ distanceM: 123.456 })];
    render(<NearbyStopsPanel stops={stops} {...defaultProps} />);
    expect(screen.getByText(/123m/)).toBeInTheDocument();
  });

  it("shows skeleton cards when loading", () => {
    render(<NearbyStopsPanel stops={[]} {...defaultProps} isLoading={true} />);
    // The SkeletonCard uses animate-pulse
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });
});
