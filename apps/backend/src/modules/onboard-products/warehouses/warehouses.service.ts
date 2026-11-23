// WarehousesService: CRUD over the warehouse table. PUT-only mutations,
// soft delete via deleted_at, and an "in-use" check (WAREHOUSE_IN_USE)
// that blocks deletion when stock / batches / catering orders are
// attached. NO_WAREHOUSE_FOR_AIRPORT is raised by receive-delivery
// when a supplier's airport has no warehouse.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'

export interface WarehouseDto {
  id: string
  code: string
  name: string
  airportCode: string
}

export interface WarehouseInput {
  code: string
  name: string
  airportCode: string
}

@Injectable()
export class WarehousesService {
  constructor(private readonly db: DbService) {}

  async list(): Promise<WarehouseDto[]> {
    const rows = await this.db.warehouse.findMany({ where: { deleted_at: null }, orderBy: { code: 'asc' } })
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, airportCode: r.airport_code }))
  }

  async create(input: WarehouseInput): Promise<WarehouseDto> {
    const code = input.code.toUpperCase()
    const airportCode = input.airportCode.toUpperCase()
    if (!/^[A-Z0-9]{3,4}$/.test(code)) {
      throw new ApiErrorException('WAREHOUSE_INVALID', 'code must be 3-4 uppercase letters/digits.', 400)
    }
    if (airportCode !== code) {
      throw new ApiErrorException('WAREHOUSE_INVALID', 'airportCode must match code.', 400)
    }
    const existing = await this.db.warehouse.findFirst({ where: { OR: [{ code }, { airport_code: airportCode }] } })
    if (existing) {
      if (existing.code === code) throw new ApiErrorException('WAREHOUSE_DUPLICATE', `Warehouse ${code} already exists.`, 409)
      throw new ApiErrorException('WAREHOUSE_DUPLICATE', `Airport ${airportCode} already has a warehouse.`, 409)
    }
    const airport = await this.db.airport.findUnique({ where: { iata_code: airportCode } })
    if (!airport) {
      throw new ApiErrorException('WAREHOUSE_INVALID', `Unknown airport ${airportCode}.`, 400)
    }
    const created = await this.db.warehouse.create({
      data: { code, name: input.name, airport_code: airportCode },
    })
    return { id: created.id, code: created.code, name: created.name, airportCode: created.airport_code }
  }

  async update(id: string, input: Partial<WarehouseInput>): Promise<WarehouseDto> {
    const existing = await this.db.warehouse.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Warehouse not found.', 404)
    const data: Record<string, string> = {}
    if (input.code !== undefined) {
      const code = input.code.toUpperCase()
      if (!/^[A-Z0-9]{3,4}$/.test(code)) {
        throw new ApiErrorException('WAREHOUSE_INVALID', 'code must be 3-4 uppercase letters/digits.', 400)
      }
      if (code !== existing.code) {
        const taken = await this.db.warehouse.findFirst({ where: { code, NOT: { id } } })
        if (taken) throw new ApiErrorException('WAREHOUSE_DUPLICATE', `Warehouse ${code} already exists.`, 409)
      }
      data.code = code
    }
    if (input.airportCode !== undefined) {
      const airportCode = input.airportCode.toUpperCase()
      if (airportCode !== (data.code ?? existing.code)) {
        throw new ApiErrorException('WAREHOUSE_INVALID', 'airportCode must match code.', 400)
      }
      const taken = await this.db.warehouse.findFirst({ where: { airport_code: airportCode, NOT: { id } } })
      if (taken) throw new ApiErrorException('WAREHOUSE_DUPLICATE', `Airport ${airportCode} already has a warehouse.`, 409)
      data.airport_code = airportCode
    }
    if (input.name !== undefined) {
      if (input.name.trim().length === 0) {
        throw new ApiErrorException('WAREHOUSE_INVALID', 'name cannot be empty.', 400)
      }
      data.name = input.name.trim()
    }
    const updated = await this.db.warehouse.update({ where: { id }, data })
    return { id: updated.id, code: updated.code, name: updated.name, airportCode: updated.airport_code }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.db.warehouse.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Warehouse not found.', 404)
    const onHand = await this.db.warehouse_stock.count({ where: { warehouse_id: id, quantity_on_hand: { gt: 0 } } })
    const batches = await this.db.stock_batch.count({ where: { warehouse_id: id, quantity_remaining: { gt: 0 } } })
    if (onHand > 0 || batches > 0) {
      throw new ApiErrorException('WAREHOUSE_IN_USE', 'Warehouse still holds stock.', 409)
    }
    const inOrders = await this.db.catering_order.count({ where: { warehouse_id: id } })
    if (inOrders > 0) {
      throw new ApiErrorException('WAREHOUSE_IN_USE', 'Warehouse still has catering orders.', 409)
    }
    await this.db.warehouse.update({ where: { id }, data: { deleted_at: new Date() } })
  }
}
