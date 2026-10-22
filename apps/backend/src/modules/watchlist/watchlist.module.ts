import { Module } from '@nestjs/common'
import { WatchlistController } from './watchlist.controller'
import { WatchlistService } from './watchlist.service'
import { WatchlistAuditService } from './watchlist.audit'
import { SystemWatchlistClock, WatchlistClock } from './watchlist.clock'

@Module({
  controllers: [WatchlistController],
  providers: [WatchlistService, WatchlistAuditService, { provide: WatchlistClock, useClass: SystemWatchlistClock }],
})
export class WatchlistModule {}
