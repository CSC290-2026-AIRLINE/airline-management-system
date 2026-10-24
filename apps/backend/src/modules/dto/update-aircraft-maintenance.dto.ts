export class UpdateAircraftMaintenanceDto {
  planned_start_date?: Date | string;
  planned_end_date?: Date | string;
  actual_end_date?: Date | string;
  status?: string; // planned, in_progress, completed, cancelled
}