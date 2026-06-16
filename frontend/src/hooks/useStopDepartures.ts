import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";

// Raw API types (snake_case)
type DepartureApi = {
  trip_id: string;
  route_id: string;
  route_short_name?: string | null;
  route_color?: string | null;
  stop_id: string;
  arrival_time?: number | null;
  departure_time?: number | null;
  type: string; // "predicted" or "scheduled"
  minutes_away?: number | null;
};

type StopDeparturesResponse = {
  stop_id: string;
  departures: DepartureApi[];
};

// CamelCase UI type
export interface Departure {
  tripId: string;
  routeId: string;
  routeShortName?: string;
  routeColor?: string;
  stopId: string;
  arrivalTime?: number;
  departureTime?: number;
  type: string;
  minutesAway?: number;
}

const toDeparture = (raw: DepartureApi): Departure => ({
  tripId: raw.trip_id,
  routeId: raw.route_id,
  routeShortName: raw.route_short_name ?? undefined,
  routeColor: raw.route_color ?? undefined,
  stopId: raw.stop_id,
  arrivalTime: raw.arrival_time ?? undefined,
  departureTime: raw.departure_time ?? undefined,
  type: raw.type,
  minutesAway: raw.minutes_away ?? undefined,
});

const fetchStopDepartures = async (stopId: string, limit = 10) => {
  const encoded = encodeURIComponent(stopId);
  const response = await apiGet<StopDeparturesResponse>(
    `/api/stops/${encoded}/departures?limit=${limit}`
  );
  return response.departures.map(toDeparture);
};

export const useStopDepartures = (stopId: string | null) =>
  useQuery({
    queryKey: ["stop-departures", stopId],
    queryFn: () => fetchStopDepartures(stopId!),
    enabled: Boolean(stopId),
    staleTime: 10000,
    refetchInterval: 10000,
  });
