import { useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import MapView from "./components/MapView";
import { useRoutes } from "./hooks/useRoutes";
import { useVehiclePositions } from "./hooks/useVehiclePositions";
import type { Route } from "./api/types";

const drawerWidth = 280;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const buildRouteIndex = (routes: Route[] | undefined) => {
  const map = new Map<string, Route>();
  routes?.forEach((route) => map.set(route.id, route));
  return map;
};

export default function App() {
  const [panelOpen, setPanelOpen] = useState(false);
  const routesQuery = useRoutes();
  const positionsQuery = useVehiclePositions();

  const routes = routesQuery.data ?? [];
  const positions = positionsQuery.data ?? [];

  const routeIndex = useMemo(() => buildRouteIndex(routes), [routes]);

  const routeSummaries = useMemo(() => {
    const counts = new Map<string, { id: string; shortName: string; count: number }>();
    positions.forEach((position) => {
      const route = position.routeId ? routeIndex.get(position.routeId) : undefined;
      const id = route?.id ?? position.routeId ?? "unknown";
      const shortName = position.routeShortName ?? route?.shortName ?? "Unknown";
      const existing = counts.get(id);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(id, { id, shortName, count: 1 });
      }
    });
    return Array.from(counts.values()).sort((a, b) => a.shortName.localeCompare(b.shortName));
  }, [positions, routeIndex]);

  const loading = routesQuery.isLoading || positionsQuery.isLoading;
  const error = routesQuery.error ?? positionsQuery.error;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Bus Tracker
          </Typography>
          <Button color="inherit" onClick={() => setPanelOpen(true)}>
            Panel
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Drawer
          anchor="left"
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          sx={{
            "& .MuiDrawer-paper": {
              width: drawerWidth,
            },
          }}
        >
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">Overview</Typography>
            <Typography variant="body2" color="text.secondary">
              Vehicles: {positions.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Routes: {routes.length}
            </Typography>
          </Box>
          <Divider />
          <List dense>
            {routeSummaries.map((route) => (
              <ListItem key={route.id}>
                <ListItemText
                  primary={route.shortName}
                  secondary={`${route.count} vehicle${route.count === 1 ? "" : "s"}`}
                />
              </ListItem>
            ))}
          </List>
        </Drawer>

        <Box sx={{ flex: 1, minWidth: 0, position: "relative" }}>
          {error && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{getErrorMessage(error)}</Alert>
            </Box>
          )}
          {loading ? (
            <Box
              sx={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <MapView positions={positions} routes={routes} />
          )}
        </Box>
      </Box>
    </Box>
  );
}
