import { Injectable } from '@nestjs/common'
import type { ScreeningPort, ScreeningResult } from '../contracts'

@Injectable()
export class ScreeningStub implements ScreeningPort {
  screen(): Promise<ScreeningResult> {
    return Promise.resolve({ result: 'clear', reasons: [] })
  }
}
