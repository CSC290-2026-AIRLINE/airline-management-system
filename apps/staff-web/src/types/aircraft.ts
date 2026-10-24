export type AircraftStatus = 'In service' | 'In maintenance' | 'Grounded';

export interface Aircraft {
  id: string;
  tailNumber: string;
  model: string;
  base: string;
  capacity: number;
  status: AircraftStatus;
  statusReason?: string;
  statusStartDate?: string;
  statusEndDate?: string;
  retiredOn?: string | null;
  entryIntoService: string;
  maintenanceType?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAircraftInput {
  tailNumber: string;
  model: string;
  base: string;
  capacity?: number;
  entryDate?: string;
  status?: AircraftStatus;
}

export type UpdateAircraftInput = Partial<CreateAircraftInput> & {
  retired_on?: string | null;
  base_airport_code?: string;
};
