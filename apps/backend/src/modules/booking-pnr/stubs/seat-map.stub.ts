import { Injectable } from '@nestjs/common'
import type { SeatMap, SeatMapPort } from '../contracts'
import { buildDemoRows, demoCabinSummaries } from '../seats/demo-layout'

@Injectable()
export class SeatMapStub implements SeatMapPort {
  getSeatMap(): Promise<SeatMap> {
    const seatMap: SeatMap = {
      cabins: demoCabinSummaries(),
      rows: buildDemoRows(),
    }
    return Promise.resolve(seatMap)
  }
}
