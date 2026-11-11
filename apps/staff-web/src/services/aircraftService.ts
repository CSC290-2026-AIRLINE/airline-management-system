import { type Aircraft, type CreateAircraftInput } from '../types/aircraft';

let mockAircrafts: Aircraft[] = [
  {
    id: '1',
    tailNumber: 'HS-TBA',
    model: 'Boeing 777-300ER',
    capacity: 348,
    status: 'ACTIVE',
  },
  {
    id: '2',
    tailNumber: 'HS-TBB',
    model: 'Airbus A350-900',
    capacity: 321,
    status: 'ACTIVE',
  },
  {
    id: '3',
    tailNumber: 'HS-TBC',
    model: 'Boeing 787-9',
    capacity: 298,
    status: 'IN_MAINTENANCE',
  },
];

export const aircraftService = {
  getAll: async (): Promise<Aircraft[]> => {
    return [...mockAircrafts];
  },

  create: async (data: CreateAircraftInput): Promise<Aircraft> => {
    const newAircraft: Aircraft = {
      id: String(Date.now()),
      ...data,
    };
    mockAircrafts = [newAircraft, ...mockAircrafts];
    return newAircraft;
  },
  update: async (id: string, data: Partial<Aircraft>): Promise<Aircraft> => {
    let updatedAircraft: Aircraft | null = null;
    mockAircrafts = mockAircrafts.map((aircraft) => {
      if (aircraft.id === id) {
        updatedAircraft = { ...aircraft, ...data };
        return updatedAircraft;
      }
      return aircraft;
    });
    if (!updatedAircraft) {
      throw new Error('Aircraft not found');
    }
    return updatedAircraft;
  },
  delete: async (id: string): Promise<boolean> => {
    mockAircrafts = mockAircrafts.filter((aircraft) => aircraft.id !== id);
    return true;
  },
};