export class UpdateAircraftTypeDto {
  code?: string
  manufacturer?: string
  model?: string
  layout?: any 
  hold_weight_limit_kg?: number
  max_takeoff_weight_kg?: number
  max_range_km?: number
  min_turnaround_minutes?: number
  operating_cost_per_hour?: number
  cost_currency?: string
  is_active?: boolean
}
