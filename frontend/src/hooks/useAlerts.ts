import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import type { Alert } from "../api/types";

type AlertApi = {
  alert_id?: string | null;
  header_text?: string | null;
  description_text?: string | null;
  route_ids?: string[];
  cause?: string | null;
  effect?: string | null;
  active_periods?: { start?: number; end?: number }[];
};

type AlertsResponse = {
  alerts: AlertApi[];
};

export const toAlert = (raw: AlertApi): Alert => ({
  alertId: raw.alert_id ?? undefined,
  headerText: raw.header_text ?? undefined,
  descriptionText: raw.description_text ?? undefined,
  routeIds: raw.route_ids ?? [],
  cause: raw.cause ?? undefined,
  effect: raw.effect ?? undefined,
  activePeriods: raw.active_periods ?? [],
});

const fetchAlerts = async () => {
  const response = await apiGet<AlertsResponse>("/api/alerts");
  return response.alerts.map(toAlert);
};

export const useAlerts = () =>
  useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    staleTime: 30000,
    refetchInterval: 30000,
  });
