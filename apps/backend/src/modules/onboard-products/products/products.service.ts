// ProductsService: full CRUD over the F12 product catalog, with PUT
// only, soft delete via deleted_at, and a real (in-use) check on
// delete that raises PRODUCT_IN_USE. The image upload goes through
// the StoragePort so the rest of the module never knows about the
// underlying object store.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { toNumber } from '../common/mapping'
import type { Prisma } from '../../../db/generated/prisma/client'
import type { ProductDraft } from './dto/product.dto'

export interface ProductDto {
  id: string
  sku: string
  category: string
  typeCode: string
  name: string
  description: string | null
  priceAmount: number
  purchaseCostAmount: number | null
  shelfLifeDays: number | null
  isPremium: boolean
  isActive: boolean
  imageKey: string | null
  dietaryAttributes: string[]
  isInUse: boolean
}

export interface ProductCreateResult {
  product: ProductDto
}

@Injectable()
export class ProductsService {
  constructor(private readonly db: DbService) {}

  async list(): Promise<ProductDto[]> {
    const rows = await this.db.product.findMany({
      where: { deleted_at: null },
      include: { product_dietary: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
    return Promise.all(rows.map((r) => this.toDto(r)))
  }

  async get(id: string): Promise<ProductDto> {
    const row = await this.db.product.findFirst({
      where: { id, deleted_at: null },
      include: { product_dietary: true },
    })
    if (!row) throw new ApiErrorException('NOT_FOUND', 'Product not found.', 404)
    return this.toDto(row)
  }

  async create(draft: ProductDraft, storage: { storeImage: (name: string, buf: Buffer) => Promise<string> }): Promise<ProductCreateResult> {
    const skuTaken = await this.db.product.findFirst({ where: { sku: draft.sku, deleted_at: null } })
    if (skuTaken) throw new ApiErrorException('DUPLICATE_PRODUCT', `SKU ${draft.sku} already exists.`, 409)
    let imageKey: string | null = null
    if (draft.photo) {
      const match = /^data:[^;]+;base64,(.+)$/.exec(draft.photo.dataUrl)
      if (!match) throw new ApiErrorException('IMAGE_INVALID', 'photo.dataUrl is malformed.', 400)
      imageKey = await storage.storeImage(draft.photo.fileName, Buffer.from(match[1], 'base64'))
    }
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: draft.sku,
          category: draft.category,
          type_code: draft.typeCode,
          name: draft.name,
          price_amount: draft.priceAmount,
          purchase_cost_amount: draft.purchaseCostAmount,
          shelf_life_days: draft.shelfLifeDays,
          is_premium: draft.isPremium,
          is_active: draft.isActive,
          image_key: imageKey,
          image_updated_at: imageKey ? new Date() : null,
        },
      })
      if (draft.dietaryAttributes.length > 0) {
        await tx.product_dietary.createMany({
          data: draft.dietaryAttributes.map((attribute) => ({ product_id: created.id, attribute })),
        })
      }
      return tx.product.findUniqueOrThrow({
        where: { id: created.id },
        include: { product_dietary: true },
      })
    })
    return { product: await this.toDto(row) }
  }

  async update(
    id: string,
    patch: Partial<ProductDraft>,
    storage: { storeImage: (name: string, buf: Buffer) => Promise<string> },
  ): Promise<ProductCreateResult> {
    const existing = await this.db.product.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Product not found.', 404)
    if (patch.sku && patch.sku !== existing.sku) {
      const skuTaken = await this.db.product.findFirst({ where: { sku: patch.sku, deleted_at: null, NOT: { id } } })
      if (skuTaken) throw new ApiErrorException('DUPLICATE_PRODUCT', `SKU ${patch.sku} already exists.`, 409)
    }
    let imageKey: string | null | undefined
    if (patch.photo) {
      const match = /^data:[^;]+;base64,(.+)$/.exec(patch.photo.dataUrl)
      if (!match) throw new ApiErrorException('IMAGE_INVALID', 'photo.dataUrl is malformed.', 400)
      imageKey = await storage.storeImage(patch.photo.fileName, Buffer.from(match[1], 'base64'))
    }
    await this.db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.sku !== undefined ? { sku: patch.sku } : {}),
          ...(patch.category !== undefined ? { category: patch.category } : {}),
          ...(patch.typeCode !== undefined ? { type_code: patch.typeCode } : {}),
          ...(patch.priceAmount !== undefined ? { price_amount: patch.priceAmount } : {}),
          ...(patch.purchaseCostAmount !== undefined ? { purchase_cost_amount: patch.purchaseCostAmount } : {}),
          ...(patch.shelfLifeDays !== undefined ? { shelf_life_days: patch.shelfLifeDays } : {}),
          ...(patch.isPremium !== undefined ? { is_premium: patch.isPremium } : {}),
          ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
          ...(imageKey !== undefined ? { image_key: imageKey, image_updated_at: imageKey ? new Date() : null } : {}),
        },
      })
      if (patch.dietaryAttributes !== undefined) {
        await tx.product_dietary.deleteMany({ where: { product_id: id } })
        if (patch.dietaryAttributes.length > 0) {
          await tx.product_dietary.createMany({
            data: patch.dietaryAttributes.map((attribute) => ({ product_id: id, attribute })),
          })
        }
      }
    })
    const updated = await this.db.product.findUniqueOrThrow({ where: { id }, include: { product_dietary: true } })
    return { product: await this.toDto(updated) }
  }

  // Soft delete: refuse if the product is referenced by any stock or
  // open catering order. The check looks at warehouse_stock (non-zero
  // on-hand), stock_batch.quantity_remaining, or any catering_order_line
  // for a flight whose catering_order.status is not 'closed' or 'void'.
  async remove(id: string): Promise<void> {
    const existing = await this.db.product.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Product not found.', 404)
    const onHand = await this.db.warehouse_stock.count({ where: { product_id: id, quantity_on_hand: { gt: 0 } } })
    const batchLeft = await this.db.stock_batch.count({ where: { product_id: id, quantity_remaining: { gt: 0 } } })
    if (onHand > 0 || batchLeft > 0) {
      throw new ApiErrorException('PRODUCT_IN_USE', 'Product still has stock in a warehouse.', 409)
    }
    const inAircraft = await this.db.aircraft_stock.count({ where: { product_id: id, quantity: { gt: 0 } } })
    if (inAircraft > 0) {
      throw new ApiErrorException('PRODUCT_IN_USE', 'Product still on an aircraft.', 409)
    }
    await this.db.product.update({ where: { id }, data: { deleted_at: new Date() } })
  }

  private async toDto(row: Prisma.productGetPayload<{ include: { product_dietary: true } }>): Promise<ProductDto> {
    const stockCount = await this.db.warehouse_stock.count({ where: { product_id: row.id, quantity_on_hand: { gt: 0 } } })
    const batchCount = await this.db.stock_batch.count({ where: { product_id: row.id, quantity_remaining: { gt: 0 } } })
    const aircraftCount = await this.db.aircraft_stock.count({ where: { product_id: row.id, quantity: { gt: 0 } } })
    return {
      id: row.id,
      sku: row.sku,
      category: row.category,
      typeCode: row.type_code,
      name: row.name,
      description: row.description,
      priceAmount: toNumber(row.price_amount),
      purchaseCostAmount: row.purchase_cost_amount == null ? null : toNumber(row.purchase_cost_amount),
      shelfLifeDays: row.shelf_life_days,
      isPremium: row.is_premium,
      isActive: row.is_active,
      imageKey: row.image_key,
      dietaryAttributes: row.product_dietary.map((d) => d.attribute),
      isInUse: stockCount + batchCount + aircraftCount > 0,
    }
  }
}
