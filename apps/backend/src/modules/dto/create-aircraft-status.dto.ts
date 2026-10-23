export class CreateAircraftStatusDto {
  status!: string; // 'in_service' หรือ 'grounded' เท่านั้น
  reason?: string;
  start_date!: Date | string;
  end_date?: Date | string; // สามารถเป็นค่าว่าง (null) ได้ถ้าเป็น open-ended
}