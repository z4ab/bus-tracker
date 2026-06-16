import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useVehicleArrivals } from "../hooks/useVehicleArrivals";
import type { VehicleArrivals, VehicleArrivalStop } from "../api/types";

// ── Mock apiGet ─────────────────────────────────────────────────────────────

const mockApiGet = vi.fn<(path: string) => Promise<unknown>>();

vi.mock("../api/client", () => ({
  apiGet: (path: string) => mockApiGet(path),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useVehicleArrivals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and transforms arrivals correctly", async () => {
    const apiResponse = {
      vehicle_id: "V-1234",
      trip_id: "T-5678",
      route_id: "R-9012",
      feed_timestamp: 1718500000,
      updated_at: "2025-06-16T10:00:00Z",
      stops: [
        {
          stop_id: "S-100",
          stop_name: "Main St / Waterloo Ave",
          stop_lat: 43.45,
          stop_lon: -80.49,
          stop_sequence: 1,
          arrival_time: 1718500200,
          arrival_delay: 30,
          departure_time: 1718500260,
          departure_delay: 15,
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const { result } = renderHook(() => useVehicleArrivals("V-1234"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data: VehicleArrivals = result.current.data!;

    // Top-level fields
    expect(data.vehicleId).toBe("V-1234");
    expect(data.tripId).toBe("T-5678");
    expect(data.routeId).toBe("R-9012");
    expect(data.feedTimestamp).toBe(1718500000);
    expect(data.updatedAt).toBe("2025-06-16T10:00:00Z");

    // Stop fields
    expect(data.stops).toHaveLength(1);
    const stop: VehicleArrivalStop = data.stops[0];
    expect(stop.stopId).toBe("S-100");
    expect(stop.stopName).toBe("Main St / Waterloo Ave");
    expect(stop.stopLat).toBe(43.45);
    expect(stop.stopLon).toBe(-80.49);
    expect(stop.stopSequence).toBe(1);
    expect(stop.arrivalTime).toBe(1718500200);
    expect(stop.arrivalDelay).toBe(30);
    expect(stop.departureTime).toBe(1718500260);
    expect(stop.departureDelay).toBe(15);

    expect(mockApiGet).toHaveBeenCalledWith("/api/vehicles/V-1234/arrivals");
  });

  it("handles empty stops array", async () => {
    const apiResponse = {
      vehicle_id: "V-5678",
      stops: [],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const { result } = renderHook(() => useVehicleArrivals("V-5678"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data: VehicleArrivals = result.current.data!;
    expect(data.vehicleId).toBe("V-5678");
    expect(data.stops).toHaveLength(0);
  });

  it("handles null/optional stop fields", async () => {
    const apiResponse = {
      vehicle_id: "V-9012",
      stops: [
        {
          stop_id: "S-200",
          stop_name: null,
          stop_lat: null,
          stop_lon: null,
          stop_sequence: null,
          arrival_time: null,
          arrival_delay: null,
          departure_time: null,
          departure_delay: null,
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const { result } = renderHook(() => useVehicleArrivals("V-9012"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data: VehicleArrivals = result.current.data!;
    expect(data.stops).toHaveLength(1);
    const stop: VehicleArrivalStop = data.stops[0];
    expect(stop.stopId).toBe("S-200");
    expect(stop.stopName).toBeUndefined();
    expect(stop.stopLat).toBeUndefined();
    expect(stop.stopLon).toBeUndefined();
    expect(stop.stopSequence).toBeUndefined();
    expect(stop.arrivalTime).toBeUndefined();
    expect(stop.arrivalDelay).toBeUndefined();
    expect(stop.departureTime).toBeUndefined();
    expect(stop.departureDelay).toBeUndefined();
  });

  it("is disabled when vehicleId is null", async () => {
    const { result } = renderHook(() => useVehicleArrivals(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("propagates API errors", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useVehicleArrivals("V-ERR"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect((result.current.error as Error).message).toBe("Network error");
  });
});
