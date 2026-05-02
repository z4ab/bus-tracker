export interface Route {
  id: string;
  shortName: string;
  longName?: string;
  color?: string;
  textColor?: string;
}

export interface VehiclePosition {
  id: string;
  lat: number;
  lon: number;
  routeId?: string;
  routeShortName?: string;
  routeColor?: string;
  updatedAt?: string;
  heading?: number;
}
