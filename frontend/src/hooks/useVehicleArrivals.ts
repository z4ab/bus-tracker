import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { VehicleArrivals, VehicleArrivalStop } from "../api/types";

type VehicleArrivalStopApi = {
  stop_id?: string | null;
  stop_name?: string | null;
  stop_lat?: number | null;
  stop_lon?: number | null;
  stop_sequence?: number | null;
  arrival_time?: number | null;
  arrival_delay?: number | null;
  departure_time?: number | null;
  departure_delay?: number | null;
};

type VehicleArrivalsApi = {
  vehicle_id: string;
  trip_id?: string | null;
  route_id?: string | null;
  feed_timestamp?: number | null;
  updated_at?: string | null;
  stops: VehicleArrivalStopApi[];
};

const toStop = (raw: VehicleArrivalStopApi): VehicleArrivalStop => ({
  stopId: raw.stop_id ?? undefined,
  stopName: raw.stop_name ?? undefined,
  stopLat: raw.stop_lat ?? undefined,
  stopLon: raw.stop_lon ?? undefined,
  stopSequence: raw.stop_sequence ?? undefined,
  arrivalTime: raw.arrival_time ?? undefined,
  arrivalDelay: raw.arrival_delay ?? undefined,
  departureTime: raw.departure_time ?? undefined,
  departureDelay: raw.departure_delay ?? undefined,
});

const toArrivals = (raw: VehicleArrivalsApi): VehicleArrivals => ({
  vehicleId: raw.vehicle_id,
  tripId: raw.trip_id ?? undefined,
  routeId: raw.route_id ?? undefined,
  feedTimestamp: raw.feed_timestamp ?? undefined,
  updatedAt: raw.updated_at ?? undefined,
  stops: raw.stops.map(toStop),
});

const fetchVehicleArrivals = async (vehicleId: string) => {
  const encodedId = encodeURIComponent(vehicleId);
  const response = await apiGet<VehicleArrivalsApi>(`/api/vehicles/${encodedId}/arrivals`);
  return toArrivals(response);
};

/**
 * Fetch predicted arrivals for a vehicle at upcoming stops.
 * Used by MapView to show a vehicle's upcoming stops popup.
 * Available for future vehicle-detail panels or timeline views.
 */
export const useVehicleArrivals = (vehicleId: string | null) =>
  useQuery({
    queryKey: ["vehicle-arrivals", vehicleId],
    queryFn: () => fetchVehicleArrivals(vehicleId ?? ""),
    enabled: Boolean(vehicleId),
    staleTime: 10000,
    refetchInterval: 10000,
  });
