import { IsString, Matches } from 'class-validator'
import { IsCalendarDate, IsOnOrAfter, TrimUpper } from './validation'

/**
 * A base and a date window, `?dateFrom=2026-09-15&dateTo=2026-09-19&base=BKK`. Build pairings, Assign crew and Fix &
 * publish all scope their pages by it, as a query string or as the body of a write.
 */
export class WindowQueryDto {
  @IsCalendarDate()
  dateFrom!: string

  @IsCalendarDate()
  @IsOnOrAfter('dateFrom')
  dateTo!: string

  @TrimUpper()
  @IsString({ message: 'base is required' })
  @Matches(/^[A-Z]{3}$/, { message: 'base must be a 3-letter IATA code' })
  base!: string
}
