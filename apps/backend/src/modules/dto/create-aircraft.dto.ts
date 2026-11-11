export class CreateAircraftDto {
  tailNumber!: string;
  type!: string;
  base!: string;
  status!: 'IN_SERVICE' | 'IN_MAINTENANCE' | 'GROUNDED';
}