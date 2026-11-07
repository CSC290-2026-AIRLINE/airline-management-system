import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { CaseNumberSequence } from './common/report.ports'

@Injectable()
export class PrismaCaseNumberSequence implements CaseNumberSequence {
  constructor(private readonly db: DbService) {}

  async next(): Promise<number> {
    const [row] = await this.db.$queryRaw<{ value: bigint }[]>`
      SELECT nextval('lost_bag_case_seq') AS value
    `

    return Number(row.value)
  }
}
