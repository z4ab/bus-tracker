import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { CacheStatus, VehiclePosition } from "../api/types";

type VehiclePositionApi = {
  vehicle_id?: string | null;
  trip_id?: string | null;
  route_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  bearing?: number | null;
  speed?: number | null;
  timestamp?: number | null;
  transport_type?: string | null;
};

type VehiclePositionsResponse = {
  vehicles: VehiclePositionApi[];
  last_updated?: string | null;
  last_refresh_age_seconds?: number | null;
  stale?: boolean;
  refresh_error?: string | null;
};

const toVehiclePosition = (raw: VehiclePositionApi): VehiclePosition => ({
  id: raw.vehicle_id ?? "unknown",
  lat: raw.latitude ?? NaN,
  lon: raw.longitude ?? NaN,
  routeId: raw.route_id ?? undefined,
  heading: raw.bearing ?? undefined,
  updatedAt: raw.timestamp ? new Date(raw.timestamp * 1000).toISOString() : undefined,
  transportType: raw.transport_type === "lrt" ? "lrt" : "bus",
});

const toCacheStatus = (raw: VehiclePositionsResponse): CacheStatus => ({
  lastUpdated: raw.last_updated ?? "",
  lastRefreshAgeSeconds: raw.last_refresh_age_seconds ?? null,
  stale: raw.stale ?? false,
  refreshError: raw.refresh_error ?? null,
});

const fetchVehiclePositions = async () => {
  const response = await apiGet<VehiclePositionsResponse>("/api/vehicles");
  return {
    positions: response.vehicles.map(toVehiclePosition),
    cacheStatus: toCacheStatus(response),
  };
};

export const useVehiclePositions = () =>
  useQuery({
    queryKey: ["vehicle-positions"],
    queryFn: fetchVehiclePositions,
    staleTime: 10000,
    refetchInterval: 10000,
  });
