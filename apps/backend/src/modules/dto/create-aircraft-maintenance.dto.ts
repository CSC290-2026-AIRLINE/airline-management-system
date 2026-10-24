export class CreateAircraftMaintenanceDto {
  maintenance_type!: string; 
  planned_start_date!: Date | string;
  planned_end_date!: Date | string;
}