import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { Route } from "../api/types";

type RouteShapePointApi = {
  lat?: number | null;
  lon?: number | null;
  sequence?: number | null;
};

type RouteApi = {
  route_id: string;
  route_short_name?: string | null;
  route_long_name?: string | null;
  route_color?: string | null;
  route_text_color?: string | null;
  shape?: RouteShapePointApi[] | null;
};

export const toRoute = (raw: RouteApi): Route => {
  const shape = raw.shape
    ?.filter(
      (point): point is { lat: number; lon: number; sequence?: number | null } =>
        typeof point.lat === "number" &&
        Number.isFinite(point.lat) &&
        typeof point.lon === "number" &&
        Number.isFinite(point.lon)
    )
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((point) => ({
      lat: point.lat,
      lon: point.lon,
      sequence: point.sequence ?? undefined,
    }));

  return {
    id: raw.route_id,
    shortName: raw.route_short_name ?? raw.route_long_name ?? raw.route_id,
    longName: raw.route_long_name ?? undefined,
    color: raw.route_color ?? undefined,
    textColor: raw.route_text_color ?? undefined,
    shape: shape && shape.length > 1 ? shape : undefined,
  };
};

const fetchRoutes = async () => {
  const response = await apiGet<{ routes: RouteApi[] }>("/api/routes");
  return response.routes.map(toRoute);
};

export const useRoutes = () =>
  useQuery({
    queryKey: ["routes"],
    queryFn: fetchRoutes,
    staleTime: 60000,
    refetchInterval: 60000,
  });
