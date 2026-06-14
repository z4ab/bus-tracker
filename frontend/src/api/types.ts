export interface RouteShapePoint {
  lat: number;
  lon: number;
  sequence?: number;
}

export interface Route {
  id: string;
  shortName: string;
  longName?: string;
  color?: string;
  textColor?: string;
  shape?: RouteShapePoint[];
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
  transportType?: 'bus' | 'lrt';
}

export interface VehicleArrivalStop {
  stopId?: string;
  stopName?: string;
  stopLat?: number;
  stopLon?: number;
  stopSequence?: number;
  arrivalTime?: number;
  arrivalDelay?: number;
  departureTime?: number;
  departureDelay?: number;
}

export interface VehicleArrivals {
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  feedTimestamp?: number;
  updatedAt?: string;
  stops: VehicleArrivalStop[];
}

export interface Stop {
  stopId: string;
  stopName?: string;
  stopLat: number;
  stopLon: number;
  distanceM: number;
  zoneId?: string;
  wheelchairBoarding?: number;
  transportType?: string;
}
