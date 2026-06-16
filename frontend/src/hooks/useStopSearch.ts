import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { Stop } from "../api/types";

type StopApi = {
  stop_id: string;
  stop_name?: string | null;
  stop_lat?: number | null;
  stop_lon?: number | null;
  distance_m?: number | null;
};

type StopSearchResponse = {
  stops: StopApi[];
};

const toStop = (raw: StopApi): Stop => ({
  stopId: raw.stop_id,
  stopName: raw.stop_name ?? undefined,
  stopLat: raw.stop_lat ?? 0,
  stopLon: raw.stop_lon ?? 0,
  distanceM: raw.distance_m ?? 0,
});

const fetchStopSearch = async (query: string) => {
  const encoded = encodeURIComponent(query);
  const response = await apiGet<StopSearchResponse>(`/api/stops/search?q=${encoded}`);
  return response.stops.map(toStop);
};

export const useStopSearch = (query: string) =>
  useQuery({
    queryKey: ["stop-search", query],
    queryFn: () => fetchStopSearch(query),
    enabled: query.trim().length >= 2, // only search when 2+ chars
    staleTime: 60000,
  });
