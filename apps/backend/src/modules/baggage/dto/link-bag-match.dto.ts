import { IsUUID } from 'class-validator'

/** Body of `POST /api/staff/bag-matches`: link a held found bag to an open or lost case by hand. */
export class LinkBagMatchDto {
  @IsUUID()
  reportId: string

  @IsUUID()
  foundBagId: string
}
