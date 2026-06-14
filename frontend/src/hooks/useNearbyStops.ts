import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { Stop } from "../api/types";

type StopApi = {
  stop_id: string;
  stop_name?: string | null;
  stop_lat?: number | null;
  stop_lon?: number | null;
  distance_m?: number | null;
  zone_id?: string | null;
  wheelchair_boarding?: number | null;
};

type NearbyStopsResponse = {
  stops: StopApi[];
};

const toStop = (raw: StopApi): Stop => ({
  stopId: raw.stop_id,
  stopName: raw.stop_name ?? undefined,
  stopLat: raw.stop_lat ?? 0,
  stopLon: raw.stop_lon ?? 0,
  distanceM: raw.distance_m ?? 0,
  zoneId: raw.zone_id ?? undefined,
  wheelchairBoarding: raw.wheelchair_boarding ?? undefined,
});

const fetchNearbyStops = async (lat: number, lon: number, radius: number) => {
  const roundedLat = lat.toFixed(5);
  const roundedLon = lon.toFixed(5);
  const response = await apiGet<NearbyStopsResponse>(
    `/api/stops/nearby?lat=${roundedLat}&lon=${roundedLon}&radius=${radius}`
  );
  return response.stops.map(toStop);
};

/**
 * Fetch stops near a map center, with debounce via staleTime + keepPreviousData.
 *
 * staleTime of 60s means panning within the same stale window reuses cached data
 * instead of refetching. keepPreviousData prevents layout flicker when a new
 * query does fire after the stale window expires.
 *
 * Combined with the 1s debounce on the moveend callback in MapBindings.tsx,
 * this ensures rapid panning does not flood the API with nearby-stop requests.
 */
export const useNearbyStops = (center: [number, number] | null, radius = 500) =>
  useQuery({
    queryKey: ["nearby-stops", center?.[0], center?.[1], radius],
    queryFn: () => fetchNearbyStops(center![0], center![1], radius),
    enabled: center !== null,
    staleTime: 60_000,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });
