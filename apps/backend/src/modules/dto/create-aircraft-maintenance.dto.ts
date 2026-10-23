export class CreateAircraftMaintenanceDto {
  maintenance_type!: string; // เช่น a_check, b_check, c_check, d_check, unscheduled
  planned_start_date!: Date | string;
  planned_end_date!: Date | string;
}