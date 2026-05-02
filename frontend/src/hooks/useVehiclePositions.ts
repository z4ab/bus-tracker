import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { VehiclePosition } from "../api/types";

type VehiclePositionApi = {
  vehicle_id?: string | null;
  trip_id?: string | null;
  route_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  bearing?: number | null;
  speed?: number | null;
  timestamp?: number | null;
};

const toVehiclePosition = (raw: VehiclePositionApi): VehiclePosition => ({
  id: raw.vehicle_id ?? "unknown",
  lat: raw.latitude ?? NaN,
  lon: raw.longitude ?? NaN,
  routeId: raw.route_id ?? undefined,
  heading: raw.bearing ?? undefined,
  updatedAt: raw.timestamp ? new Date(raw.timestamp * 1000).toISOString() : undefined,
});

const fetchVehiclePositions = async () => {
  const response = await apiGet<{ vehicles: VehiclePositionApi[] }>("/api/vehicles");
  return response.vehicles.map(toVehiclePosition);
};

export const useVehiclePositions = () =>
  useQuery({
    queryKey: ["vehicle-positions"],
    queryFn: fetchVehiclePositions,
    staleTime: 10000,
    refetchInterval: 10000,
  });
