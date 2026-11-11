export interface Aircraft {
  id: string;
  tailNumber: string;    
  model: string;    
  capacity: number;    
  status: 'ACTIVE' | 'IN_MAINTENANCE' | 'RETIRED';
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAircraftInput {
  tailNumber: string;
  model: string;
  capacity: number;
  status: 'ACTIVE' | 'IN_MAINTENANCE' | 'RETIRED';
}

export interface UpdateAircraftInput extends Partial<CreateAircraftInput> {}