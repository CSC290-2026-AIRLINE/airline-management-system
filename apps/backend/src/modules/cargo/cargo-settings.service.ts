import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { CreateProhibitedItemDto } from './dto/create-prohibited-item.dto'
import type { UpdateProhibitedItemDto } from './dto/update-prohibited-item.dto'
import type { UpdateSettingsDto } from './dto/update-settings.dto'
import { SETTING_KEYS } from './dto/update-settings.dto'

@Injectable()
export class CargoSettingsService {
  constructor(private readonly db: DbService) {}

  // ── Prohibited Items ──────────────────────────────────────────────

  listProhibitedItems() {
    return this.db.cargo_prohibited_item.findMany({ orderBy: { keyword: 'asc' } })
  }

  async createProhibitedItem(dto: CreateProhibitedItemDto) {
    const keyword = dto.keyword.trim().toLowerCase()
    if (!keyword) {
      throw new UnprocessableEntityException({ error: { code: 'BLANK_KEYWORD', message: 'Keyword must not be blank after trimming' } })
    }

    try {
      return await this.db.cargo_prohibited_item.create({
        data: {
          keyword,
          reason: dto.reason,
          ...(dto.is_active != null && { is_active: dto.is_active }),
        },
      })
    } catch (err: unknown) {
      if (isPrismaUniqueViolation(err)) {
        throw new ConflictException({ error: { code: 'DUPLICATE', message: `Prohibited keyword "${keyword}" already exists` } })
      }
      throw err
    }
  }

  async updateProhibitedItem(id: string, dto: UpdateProhibitedItemDto) {
    await this.requireProhibitedItem(id)

    const data: Record<string, unknown> = { updated_at: new Date() }
    if (dto.keyword != null) {
      const keyword = dto.keyword.trim().toLowerCase()
      if (!keyword) {
        throw new UnprocessableEntityException({ error: { code: 'BLANK_KEYWORD', message: 'Keyword must not be blank after trimming' } })
      }
      data.keyword = keyword
    }
    if (dto.reason != null) data.reason = dto.reason
    if (dto.is_active != null) data.is_active = dto.is_active

    try {
      return await this.db.cargo_prohibited_item.update({ where: { id }, data })
    } catch (err: unknown) {
      if (isPrismaUniqueViolation(err)) {
        throw new ConflictException({ error: { code: 'DUPLICATE', message: `Prohibited keyword already exists` } })
      }
      throw err
    }
  }

  // ── Settings ──────────────────────────────────────────────────────

  listSettings() {
    return this.db.cargo_setting.findMany({ orderBy: { key: 'asc' } })
  }

  async updateSettings(dto: UpdateSettingsDto) {
    const invalidKeys = dto.settings.filter((s) => !SETTING_KEYS.has(s.key)).map((s) => s.key)
    if (invalidKeys.length) {
      throw new UnprocessableEntityException({
        error: { code: 'INVALID_KEY', message: `Unknown setting key(s): ${invalidKeys.join(', ')}` },
      })
    }

    const writes = dto.settings.map((s) =>
      this.db.cargo_setting.update({
        where: { key: s.key },
        data: { value: String(s.value), updated_at: new Date() },
      }),
    )

    return this.db.$transaction(writes)
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async requireProhibitedItem(id: string) {
    const row = await this.db.cargo_prohibited_item.findUnique({ where: { id } })
    if (!row) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Prohibited item ${id} not found` } })
    return row
  }
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002'
}
