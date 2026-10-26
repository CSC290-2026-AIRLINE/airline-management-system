import { validateBirthDate } from '@backend/common/validation/birth-date'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma, watchlist_entry } from '@backend/db/generated/prisma/client'
import type { CreateWatchlistEntryDto, UpdateWatchlistEntryDto } from './dto/watchlist-entry.dto'
import type { ListWatchlistDto } from './dto/list-watchlist.dto'
import { WatchlistAuditService, type WatchlistActor } from './watchlist.audit'
import { WatchlistClock } from './watchlist.clock'
import { WATCHLIST_COUNTRY_CODES } from './watchlist.constants'
import { watchlistDetail, watchlistSummary } from './watchlist.response'

@Injectable()
export class WatchlistService {
  constructor(
    private readonly db: DbService,
    private readonly audit: WatchlistAuditService,
    private readonly clock: WatchlistClock,
  ) {}

  private async actor(userId: string): Promise<WatchlistActor> {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true, role: { select: { code: true } } },
    })
    if (!staff || staff.role.code !== 'security') throw new ForbiddenException('A staff account with the security role is required')
    return { userId, staffId: staff.id, role: staff.role.code }
  }

  private async run<T>(userId: string, work: (tx: Prisma.TransactionClient, actor: WatchlistActor, now: Date) => Promise<T>): Promise<T> {
    try {
      const actor = await this.actor(userId)
      return await this.db.$transaction((tx) => work(tx, actor, this.clock.now()), { isolationLevel: 'Serializable' })
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      if (code === 'P2025') throw new NotFoundException('Watchlist entry was not found')
      if (code === 'P2002' || code === 'P2034') throw new ConflictException('The record changed concurrently. Reload and try again.')
      if (code === 'P2003' || code === 'P2023') throw new BadRequestException('Invalid record reference')
      if (code === 'P1001' || code === 'P1002' || code === 'P2024')
        throw new ServiceUnavailableException('The database is temporarily unavailable')
      throw new InternalServerErrorException('The watchlist operation could not be completed')
    }
  }

  async nationalities(userId: string) {
    return this.run(userId, () => Promise.resolve({ codes: WATCHLIST_COUNTRY_CODES }))
  }

  async list(userId: string, query: ListWatchlistDto) {
    return this.run(userId, async (tx, actor, now) => {
      if (query.cursor && !(await tx.watchlist_entry.findUnique({ where: { id: query.cursor }, select: { id: true } }))) {
        throw new BadRequestException('The pagination cursor does not exist')
      }
      const where: Prisma.watchlist_entryWhereInput = {}
      if (query.status !== 'all') where.status = query.status
      if (query.listType !== 'all') where.list_type = query.listType
      if (query.search) {
        const terms = query.search.split(/\s+/).filter(Boolean)
        where.OR = [
          {
            AND: terms.map((term) => ({
              OR: [{ first_name: { contains: term, mode: 'insensitive' } }, { last_name: { contains: term, mode: 'insensitive' } }],
            })),
          },
        ]
        const passportSearch = query.search.replace(/[\s-]/g, '').toUpperCase()
        if (passportSearch) where.OR.push({ passport_number: { contains: passportSearch, mode: 'insensitive' } })
      }
      const rows = await tx.watchlist_entry.findMany({
        where,
        orderBy: [{ listed_at: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      })
      const hasMore = rows.length > query.limit
      const page = rows.slice(0, query.limit)
      await this.audit.record(tx, actor, now, 'view_sensitive')
      return { items: page.map(watchlistSummary), nextCursor: hasMore ? page[page.length - 1].id : null }
    })
  }

  async get(userId: string, id: string) {
    return this.run(userId, async (tx, actor, now) => {
      const entry = await this.find(tx, id)
      await this.audit.record(tx, actor, now, 'view_sensitive', entry)
      return watchlistDetail(entry)
    })
  }

  async create(userId: string, input: CreateWatchlistEntryDto) {
    return this.run(userId, async (tx, actor, now) => {
      validateBirthDate(input.dateOfBirth, now)
      const entry = await tx.watchlist_entry.create({
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
          date_of_birth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null,
          nationality: input.nationality ?? null,
          passport_number: input.passportNumber ?? null,
          list_type: input.listType,
          issuing_authority: input.issuingAuthority,
          reason: input.reason ?? null,
          status: 'active',
          listed_at: now,
          created_by_staff_id: actor.staffId,
        },
      })
      await this.audit.record(tx, actor, now, 'create', entry)
      return { ...watchlistDetail(entry), screeningStatus: 'not_connected' as const }
    })
  }

  async update(userId: string, id: string, input: UpdateWatchlistEntryDto) {
    return this.run(userId, async (tx, actor, now) => {
      if (!Object.values(input).some((value) => value !== undefined)) throw new BadRequestException('Provide at least one field to update')
      validateBirthDate(input.dateOfBirth, now)
      const before = await this.find(tx, id)
      const data: Prisma.watchlist_entryUpdateInput = { updated_at: new Date() }
      if (input.firstName !== undefined) data.first_name = input.firstName
      if (input.lastName !== undefined) data.last_name = input.lastName
      if (input.dateOfBirth !== undefined) data.date_of_birth = input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null
      if (input.nationality !== undefined) data.nationality = input.nationality
      if (input.passportNumber !== undefined) data.passport_number = input.passportNumber
      if (input.listType !== undefined) data.list_type = input.listType
      if (input.issuingAuthority !== undefined) data.issuing_authority = input.issuingAuthority
      if (input.reason !== undefined) data.reason = input.reason
      const entry = await tx.watchlist_entry.update({ where: { id }, data })
      await this.audit.record(tx, actor, now, 'update', entry, before)
      return { ...watchlistDetail(entry), screeningStatus: 'not_connected' as const }
    })
  }

  async clear(userId: string, id: string, reason: string) {
    return this.run(userId, async (tx, actor, now) => {
      if (!reason.trim()) throw new BadRequestException('A reason for clearing is required')
      const before = await this.find(tx, id)
      if (before.status !== 'active') throw new ConflictException('The entry is already cleared')
      const entry = await tx.watchlist_entry.update({
        where: { id },
        data: {
          status: 'cleared',
          cleared_at: now,
          cleared_by_staff_id: actor.staffId,
          clear_reason: reason.trim(),
          updated_at: new Date(),
        },
      })
      await this.audit.record(tx, actor, now, 'status_change', entry, before, reason.trim())
      return watchlistDetail(entry)
    })
  }

  private async find(tx: Prisma.TransactionClient, id: string): Promise<watchlist_entry> {
    const entry = await tx.watchlist_entry.findUnique({ where: { id } })
    if (!entry) throw new NotFoundException('Watchlist entry was not found')
    return entry
  }
}
