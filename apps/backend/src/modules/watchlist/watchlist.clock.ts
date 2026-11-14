// Feature-local port: bind the team's simulation clock here when available.
export abstract class WatchlistClock {
  abstract now(): Date
}
import { Injectable } from '@nestjs/common'

@Injectable()
export class SystemWatchlistClock extends WatchlistClock {
  now(): Date {
    return new Date()
  }
}
