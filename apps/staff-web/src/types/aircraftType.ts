export interface CabinLayout {
  cabin_class: 'first' | 'business' | 'premium_economy' | 'economy';
  first_row: number;
  last_row: number;
  columns: string[];
  aisle_after: string[];
  skip_rows?: number[];
  row_types?: {
    extra_legroom?: number[];
    exit_row?: number[];
  };
  blocked_seats?: string[];
}

export interface AircraftTypeLayout {
  cabins: CabinLayout[];
}

export interface AircraftType {
  id?: string;
  code: string;
  manufacturer: string;
  model: string;
  hold_weight_limit_kg: number;
  max_takeoff_weight_kg: number;
  max_range_km: number;
  min_turnaround_minutes: number;
  operating_cost_per_hour: number;
  cost_currency: string;
  is_active: boolean;
  layout: AircraftTypeLayout;
}
