import type { CaseNumberSequence } from '../common/report.ports'

export class InMemoryCaseNumberSequence implements CaseNumberSequence {
  private current = 0

  next(): Promise<number> {
    this.current += 1
    return Promise.resolve(this.current)
  }
}
