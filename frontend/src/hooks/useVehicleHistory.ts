import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { VehicleHistoryPoint } from "../api/types";

type VehicleHistoryPointApi = {
  latitude?: number | null;
  longitude?: number | null;
  bearing?: number | null;
  timestamp?: number | null;
};

type VehicleHistoryResponse = {
  vehicle_id: string;
  positions: VehicleHistoryPointApi[];
};

const toVehicleHistoryPoint = (raw: VehicleHistoryPointApi): VehicleHistoryPoint => ({
  lat: raw.latitude ?? NaN,
  lon: raw.longitude ?? NaN,
  bearing: raw.bearing ?? undefined,
  timestamp: raw.timestamp ?? undefined,
});

const fetchVehicleHistory = async (vehicleId: string) => {
  const response = await apiGet<VehicleHistoryResponse>(
    `/api/vehicles/${vehicleId}/history`
  );
  return response.positions
    .map(toVehicleHistoryPoint)
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
};

export const useVehicleHistory = (vehicleId: string | null) =>
  useQuery({
    queryKey: ["vehicle-history", vehicleId],
    queryFn: () => fetchVehicleHistory(vehicleId!),
    enabled: vehicleId !== null,
    staleTime: 5000,
    refetchInterval: 10000,
  });
