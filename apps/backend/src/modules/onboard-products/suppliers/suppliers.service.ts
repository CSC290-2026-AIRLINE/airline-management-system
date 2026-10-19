// SuppliersService: CRUD over the supplier table. PUT-only, soft
// delete via deleted_at, and SUPPLIER_DUPLICATE on (airport_code +
// name) collision. SUPPLIER_INVALID is the spec code for an unknown
// supplier id; we reuse it when the airport is unknown too.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'

export interface SupplierDto {
  id: string
  name: string
  airportCode: string
  contact: string | null
  isActive: boolean
}

export interface SupplierInput {
  name: string
  airportCode: string
  contact: string | null
  isActive: boolean
}

@Injectable()
export class SuppliersService {
  constructor(private readonly db: DbService) {}

  async list(airportCode?: string): Promise<SupplierDto[]> {
    const where: Record<string, unknown> = { deleted_at: null }
    if (airportCode) where.airport_code = airportCode.toUpperCase()
    const rows = await this.db.supplier.findMany({ where, orderBy: [{ airport_code: 'asc' }, { name: 'asc' }] })
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      airportCode: r.airport_code,
      contact: r.contact,
      isActive: r.is_active,
    }))
  }

  async create(input: SupplierInput): Promise<SupplierDto> {
    const airportCode = input.airportCode.toUpperCase()
    if (!input.name.trim()) {
      throw new ApiErrorException('SUPPLIER_INVALID', 'name cannot be empty.', 400)
    }
    const airport = await this.db.airport.findUnique({ where: { iata_code: airportCode } })
    if (!airport) throw new ApiErrorException('SUPPLIER_INVALID', `Unknown airport ${airportCode}.`, 400)
    const existing = await this.db.supplier.findFirst({
      where: { name: input.name.trim(), airport_code: airportCode, deleted_at: null },
    })
    if (existing) {
      throw new ApiErrorException('SUPPLIER_DUPLICATE', `Supplier ${input.name} already exists at ${airportCode}.`, 409)
    }
    const created = await this.db.supplier.create({
      data: {
        name: input.name.trim(),
        airport_code: airportCode,
        contact: input.contact?.trim() || null,
        is_active: input.isActive,
      },
    })
    return this.toDto(created)
  }

  async update(id: string, patch: Partial<SupplierInput>): Promise<SupplierDto> {
    const existing = await this.db.supplier.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('SUPPLIER_INVALID', 'Supplier not found.', 404)
    const data: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new ApiErrorException('SUPPLIER_INVALID', 'name cannot be empty.', 400)
      data.name = patch.name.trim()
    }
    if (patch.airportCode !== undefined) {
      const code = patch.airportCode.toUpperCase()
      const airport = await this.db.airport.findUnique({ where: { iata_code: code } })
      if (!airport) throw new ApiErrorException('SUPPLIER_INVALID', `Unknown airport ${code}.`, 400)
      data.airport_code = code
    }
    if (patch.contact !== undefined) {
      data.contact = patch.contact?.trim() || null
    }
    if (patch.isActive !== undefined) {
      if (typeof patch.isActive !== 'boolean') {
        throw new ApiErrorException('SUPPLIER_INVALID', 'isActive must be a boolean.', 400)
      }
      data.is_active = patch.isActive
    }
    const updated = await this.db.supplier.update({ where: { id }, data })
    return this.toDto(updated)
  }

  async remove(id: string): Promise<void> {
    const existing = await this.db.supplier.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('SUPPLIER_INVALID', 'Supplier not found.', 404)
    const receipts = await this.db.purchase_receipt.count({ where: { supplier_id: id } })
    if (receipts > 0) {
      throw new ApiErrorException('SUPPLIER_INVALID', 'Supplier still has purchase receipts.', 409)
    }
    await this.db.supplier.update({ where: { id }, data: { deleted_at: new Date() } })
  }

  private toDto(row: { id: string; name: string; airport_code: string; contact: string | null; is_active: boolean }): SupplierDto {
    return { id: row.id, name: row.name, airportCode: row.airport_code, contact: row.contact, isActive: row.is_active }
  }
}
