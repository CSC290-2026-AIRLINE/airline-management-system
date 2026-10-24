export class TurnaroundTaskDto {
  task_type!: string;
  status?: string; 
}

export class CreateTurnaroundDto {
  flight_id!: string;
  airport_code!: string;
  arrived_at!: string;
  tasks?: TurnaroundTaskDto[]; 
}

export class UpdateTaskStatusDto {
  status!: string;
  started_at?: string;
  completed_at?: string;
}