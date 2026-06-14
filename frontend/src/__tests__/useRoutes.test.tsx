import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRoutes } from "../hooks/useRoutes";
import type { Route } from "../api/types";

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

describe("useRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and transforms routes correctly", async () => {
    const apiResponse = {
      routes: [
        {
          route_id: "1",
          route_short_name: "101",
          route_long_name: "Downtown Express",
          route_color: "FF0000",
          route_text_color: "FFFFFF",
          shape: [
            { lat: 43.45, lon: -80.49, sequence: 1 },
            { lat: 43.46, lon: -80.5, sequence: 2 },
          ],
        },
        {
          route_id: "2",
          route_short_name: null,
          route_long_name: "Uptown Local",
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const { result } = renderHook(() => useRoutes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const routes: Route[] = result.current.data!;
    expect(routes).toHaveLength(2);

    // First route: full data
    expect(routes[0].id).toBe("1");
    expect(routes[0].shortName).toBe("101");
    expect(routes[0].longName).toBe("Downtown Express");
    expect(routes[0].color).toBe("FF0000");
    expect(routes[0].textColor).toBe("FFFFFF");
    expect(routes[0].shape).toHaveLength(2);
    expect(routes[0].shape![0]).toEqual({ lat: 43.45, lon: -80.49, sequence: 1 });

    // Second route: falls back to longName for shortName
    expect(routes[1].id).toBe("2");
    expect(routes[1].shortName).toBe("Uptown Local");
    expect(routes[1].longName).toBe("Uptown Local");
    expect(routes[1].shape).toBeUndefined();

    expect(mockApiGet).toHaveBeenCalledWith("/api/routes");
  });

  it("filters invalid shape points", async () => {
    const apiResponse = {
      routes: [
        {
          route_id: "3",
          route_short_name: "Loop",
          shape: [
            { lat: 43.45, lon: -80.49, sequence: 1 },
            { lat: null, lon: -80.5, sequence: 2 },
            { lat: 43.47, lon: null, sequence: 3 },
            { lat: 43.48, lon: -80.52, sequence: 4 },
          ],
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const { result } = renderHook(() => useRoutes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const routes: Route[] = result.current.data!;
    expect(routes[0].shape).toHaveLength(2);
    expect(routes[0].shape![0]).toEqual({ lat: 43.45, lon: -80.49, sequence: 1 });
    expect(routes[0].shape![1]).toEqual({ lat: 43.48, lon: -80.52, sequence: 4 });
  });

  it("returns undefined shape when fewer than 2 valid points remain", async () => {
    const apiResponse = {
      routes: [
        {
          route_id: "4",
          route_short_name: "Short",
          shape: [{ lat: 43.45, lon: -80.49, sequence: 1 }],
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const { result } = renderHook(() => useRoutes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data![0].shape).toBeUndefined();
  });

  it("handles null shape gracefully", async () => {
    const apiResponse = {
      routes: [
        {
          route_id: "5",
          route_short_name: "Null Shape",
          shape: null,
        },
      ],
    };

    mockApiGet.mockResolvedValueOnce(apiResponse);

    const { result } = renderHook(() => useRoutes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data![0].id).toBe("5");
    expect(result.current.data![0].shape).toBeUndefined();
  });

  it("propagates API errors", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useRoutes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect((result.current.error as Error).message).toBe("Network error");
  });
});
