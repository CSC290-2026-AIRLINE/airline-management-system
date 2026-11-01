import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreateWatchlistEntryDto, UpdateWatchlistEntryDto } from './dto/watchlist-entry.dto'
import { ListWatchlistDto } from './dto/list-watchlist.dto'
import { WatchlistService } from './watchlist.service'

@Controller('security/watchlist')
@UsePipes(
  new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, validationError: { target: false, value: false } }),
)
export class WatchlistController {
  constructor(private readonly service: WatchlistService) {}

  @Get('nationalities')
  nationalities(@CurrentUser() user: AuthenticatedUser) {
    return this.service.nationalities(user.id)
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListWatchlistDto) {
    return this.service.list(user.id, query)
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user.id, id)
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateWatchlistEntryDto) {
    return this.service.create(user.id, body)
  }

  @Put(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateWatchlistEntryDto) {
    return this.service.update(user.id, id, body)
  }
}
