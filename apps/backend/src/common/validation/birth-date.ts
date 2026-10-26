import { BadRequestException } from '@nestjs/common'

/** Validate a date-only DOB against an explicit UTC business date. No clock is read here. */
export function validateBirthDate(value: string | null | undefined, today: Date): void {
  if (value === null || value === undefined || value === '') return
  if (Number.isNaN(today.getTime())) throw new Error('A valid today date is required for DOB validation')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('dateOfBirth must use YYYY-MM-DD')
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('dateOfBirth must be a valid calendar date')
  }
  if (value > today.toISOString().slice(0, 10)) throw new BadRequestException('dateOfBirth cannot be in the future')
}
