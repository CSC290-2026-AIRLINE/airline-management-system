export type ReadinessStatus = 'Ready' | 'In Maintenance' | 'In Flight' | 'AOG';

export interface AircraftReadiness {
  registration_number: string; 
  aircraft_type_code: string; 
  status: ReadinessStatus;
  last_inspection_date: string;
  next_maintenance_due: string;
  checks: {
    technical_log_cleared: boolean;
    cabin_crew_ready: boolean;
    fuel_loaded: boolean;
    weight_balance_approved: boolean;
  };
  notes?: string;
}