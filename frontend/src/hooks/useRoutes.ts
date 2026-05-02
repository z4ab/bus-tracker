import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { Route } from "../api/types";

type RouteApi = {
  route_id: string;
  route_short_name?: string | null;
  route_long_name?: string | null;
  route_color?: string | null;
  route_text_color?: string | null;
};

const toRoute = (raw: RouteApi): Route => ({
  id: raw.route_id,
  shortName: raw.route_short_name ?? raw.route_long_name ?? raw.route_id,
  longName: raw.route_long_name ?? undefined,
  color: raw.route_color ?? undefined,
  textColor: raw.route_text_color ?? undefined,
});

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
