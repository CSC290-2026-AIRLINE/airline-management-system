import { Injectable } from '@nestjs/common'
import type { RefundPort, RefundRequest } from '../contracts'

@Injectable()
export class RefundStub implements RefundPort {
  readonly records: RefundRequest[] = []

  record(request: RefundRequest): Promise<void> {
    this.records.push(request)
    return Promise.resolve()
  }
}
