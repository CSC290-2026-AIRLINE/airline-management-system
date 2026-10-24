export class CreateAircraftStatusDto {
  status!: string; 
  reason?: string;
  start_date!: Date | string;
  end_date?: Date | string; 
}