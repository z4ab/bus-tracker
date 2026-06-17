import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "../App";
import type { Route, VehiclePosition, CacheStatus } from "../api/types";

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mock react-leaflet so tests don't need a real DOM with Leaflet
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Polyline: () => <div data-testid="polyline" />,
  useMap: () => ({ on: vi.fn(), off: vi.fn() }),
}));

// Also mock the sub-components that depend on Leaflet
vi.mock("../components/MapBindings", () => ({
  default: () => <div data-testid="map-bindings" />,
}));

vi.mock("../components/VehicleMarker", () => ({
  default: ({ position }: { position: VehiclePosition }) => (
    <div data-testid="vehicle-marker" data-vehicle-id={position.id} />
  ),
}));

vi.mock("../components/UserMarker", () => ({
  default: () => <div data-testid="user-marker" />,
}));

vi.mock("../components/TripStopMarker", () => ({
  default: () => <div data-testid="trip-stop-marker" />,
}));

vi.mock("../components/NearbyStopsPanel", () => ({
  default: () => <div data-testid="nearby-stops-panel" />,
}));

// Mock the hooks so they return controlled data
const mockUseRoutes = vi.fn<() => { data: Route[]; isLoading: boolean; error: unknown }>();
const mockUseVehiclePositions = vi.fn<
  () => {
    data: { positions: VehiclePosition[]; cacheStatus: CacheStatus } | undefined;
    isLoading: boolean;
    error: unknown;
  }
>();

vi.mock("../hooks/useRoutes", () => ({
  useRoutes: () => mockUseRoutes(),
}));

vi.mock("../hooks/useVehiclePositions", () => ({
  useVehiclePositions: () => mockUseVehiclePositions(),
}));

// Mock useVehicleArrivals and useNearbyStops used inside MapView
vi.mock("../hooks/useVehicleArrivals", () => ({
  useVehicleArrivals: () => ({ data: undefined }),
}));

vi.mock("../hooks/useNearbyStops", () => ({
  useNearbyStops: () => ({ data: undefined }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function stubRoutes() {
  return { data: [], isLoading: false, error: null };
}

function stubPositions() {
  return {
    data: {
      positions: [] as VehiclePosition[],
      cacheStatus: {
        lastUpdated: "",
        lastRefreshAgeSeconds: null,
        stale: false,
        refreshError: null,
      } as CacheStatus,
    },
    isLoading: false,
    error: null,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("App", () => {
  beforeEach(() => {
    mockUseRoutes.mockReturnValue(stubRoutes());
    mockUseVehiclePositions.mockReturnValue(stubPositions());
  });

  it("renders without crashing", () => {
    const Wrapper = createWrapper();
    expect(() =>
      render(
        <Wrapper>
          <App />
        </Wrapper>
      )
    ).not.toThrow();
  });

  it("shows loading spinner when queries are loading", () => {
    mockUseRoutes.mockReturnValue({ data: [], isLoading: true, error: null });
    mockUseVehiclePositions.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <App />
      </Wrapper>
    );

    // The spinner has class "animate-spin"
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error banner when there is an error", () => {
    mockUseRoutes.mockReturnValue(stubRoutes());
    mockUseVehiclePositions.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to fetch"),
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <App />
      </Wrapper>
    );

    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
  });

  it("renders the map container when data loads successfully", () => {
    mockUseRoutes.mockReturnValue(stubRoutes());
    mockUseVehiclePositions.mockReturnValue(stubPositions());

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <App />
      </Wrapper>
    );

    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("shows no-vehicles message when routes loaded but no vehicles", () => {
    const route: Route = {
      id: "route-1",
      shortName: "Route 1",
    };
    mockUseRoutes.mockReturnValue({ data: [route], isLoading: false, error: null });
    mockUseVehiclePositions.mockReturnValue(stubPositions());

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <App />
      </Wrapper>
    );

    expect(
      screen.getByText("No buses currently running on the tracked routes.")
    ).toBeInTheDocument();
  });

  it("shows stale data warning when cache is stale", () => {
    mockUseRoutes.mockReturnValue(stubRoutes());
    mockUseVehiclePositions.mockReturnValue({
      data: {
        positions: [] as VehiclePosition[],
        cacheStatus: {
          lastUpdated: "",
          lastRefreshAgeSeconds: 300,
          stale: true,
          refreshError: null,
        } as CacheStatus,
      },
      isLoading: false,
      error: null,
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <App />
      </Wrapper>
    );

    expect(screen.getByText(/Data may be stale/)).toBeInTheDocument();
    expect(screen.getByText(/last updated 5m ago/)).toBeInTheDocument();
  });
});
