import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useNearbyStops } from "../hooks/useNearbyStops";
import type { Stop } from "../api/types";

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

describe("useNearbyStops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and transforms nearby stops correctly", async () => {
    const apiResponse = {
      stops: [
        {
          stop_id: "2000",
          stop_name: "University Ave / King St",
          stop_lat: 43.4723,
          stop_lon: -80.5402,
          distance_m: 120.5,
          zone_id: "1",
          wheelchair_boarding: 1,
        },
        {
          stop_id: "3001",
          stop_name: "Charles St / Benton St",
          stop_lat: 43.4731,
          stop_lon: -80.5415,
          distance_m: 250.0,
          zone_id: "2",
          wheelchair_boarding: 0,
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const center: [number, number] = [43.472, -80.54];
    const { result } = renderHook(() => useNearbyStops(center), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stops: Stop[] = result.current.data!;
    expect(stops).toHaveLength(2);

    // First stop: full data
    expect(stops[0].stopId).toBe("2000");
    expect(stops[0].stopName).toBe("University Ave / King St");
    expect(stops[0].stopLat).toBe(43.4723);
    expect(stops[0].stopLon).toBe(-80.5402);
    expect(stops[0].distanceM).toBe(120.5);
    expect(stops[0].zoneId).toBe("1");
    expect(stops[0].wheelchairBoarding).toBe(1);

    // Second stop
    expect(stops[1].stopId).toBe("3001");
    expect(stops[1].stopName).toBe("Charles St / Benton St");
    expect(stops[1].wheelchairBoarding).toBe(0);

    expect(mockApiGet).toHaveBeenCalledWith(
      "/api/stops/nearby?lat=43.47200&lon=-80.54000&radius=500"
    );
  });

  it("handles null/empty fields", async () => {
    const apiResponse = {
      stops: [
        {
          stop_id: "4000",
          stop_name: null,
          stop_lat: null,
          stop_lon: null,
          distance_m: null,
          zone_id: null,
          wheelchair_boarding: null,
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const center: [number, number] = [43.5, -80.5];
    const { result } = renderHook(() => useNearbyStops(center), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stops: Stop[] = result.current.data!;
    expect(stops).toHaveLength(1);
    expect(stops[0].stopId).toBe("4000");
    expect(stops[0].stopName).toBeUndefined();
    expect(stops[0].stopLat).toBe(0);
    expect(stops[0].stopLon).toBe(0);
    expect(stops[0].distanceM).toBe(0);
    expect(stops[0].zoneId).toBeUndefined();
    expect(stops[0].wheelchairBoarding).toBeUndefined();
  });

  it("handles wheelchair_boarding field", async () => {
    const apiResponse = {
      stops: [
        {
          stop_id: "5000",
          stop_name: "Accessible Stop",
          stop_lat: 43.48,
          stop_lon: -80.53,
          distance_m: 50,
          zone_id: "3",
          wheelchair_boarding: 2,
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const center: [number, number] = [43.48, -80.53];
    const { result } = renderHook(() => useNearbyStops(center), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stops: Stop[] = result.current.data!;
    expect(stops[0].wheelchairBoarding).toBe(2);
  });

  it("is disabled when center is null", async () => {
    const { result } = renderHook(() => useNearbyStops(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("propagates API errors", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));

    const center: [number, number] = [43.5, -80.5];
    const { result } = renderHook(() => useNearbyStops(center), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect((result.current.error as Error).message).toBe("Network error");
  });
});
