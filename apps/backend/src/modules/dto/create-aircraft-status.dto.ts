export class CreateAircraftStatusDto {
  status!: string; // 'in_service' à¸«à¸£à¸·à¸­ 'grounded' à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™
  reason?: string;
  start_date!: Date | string;
  end_date?: Date | string; // à¸ªà¸²à¸¡à¸²à¸£à¸–à¹€à¸›à¹‡à¸™à¸„à¹ˆà¸²à¸§à¹ˆà¸²à¸‡ (null) à¹„à¸”à¹‰à¸–à¹‰à¸²à¹€à¸›à¹‡à¸™ open-ended
}