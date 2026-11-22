import { Injectable } from '@nestjs/common'
import type { LoyaltyPort, MilesQuote } from '../contracts'

@Injectable()
export class LoyaltyStub implements LoyaltyPort {
  isEnabled(): boolean {
    return false
  }

  quoteAward(): Promise<MilesQuote | null> {
    return Promise.resolve(null)
  }
}
