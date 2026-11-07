import { Injectable } from '@nestjs/common'
import type { ServiceRequestPort } from '../contracts'

@Injectable()
export class ServiceRequestStub implements ServiceRequestPort {
  createForHold(): Promise<void> {
    return Promise.resolve()
  }
}
