// ProductsService: full CRUD over the F12 product catalog, with PUT
// only, soft delete via deleted_at, and a real (in-use) check on
// delete that raises PRODUCT_IN_USE. The image upload goes through
// the StoragePort so the rest of the module never knows about the
// underlying object store.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { toNumber } from '../common/mapping'
import { productInUseMessage, productInUseReason } from '../common/product-in-use'
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

function validateCategoryFields(category: string, fields: Partial<ProductDraft>) {
  if (category !== 'meal' && (fields.isPremium || (fields.typeCode !== undefined && fields.typeCode !== 'STD'))) {
    throw new ApiErrorException('LINE_INVALID', 'Premium status and special meal codes are only available for meals.', 400)
  }
  if (category === 'duty_free' && fields.dietaryAttributes?.length) {
    throw new ApiErrorException('LINE_INVALID', 'Dietary attributes are unavailable for duty-free products.', 400)
  }
}

@Injectable()
export class ProductsService {
  constructor(private readonly db: DbService) {}

  // The product list, with the filters the staff page uses: the
  // category, the special-meal code and a dietary attribute.
  async list(filter: { category?: string; typeCode?: string; dietaryAttribute?: string } = {}): Promise<ProductDto[]> {
    const where: Record<string, unknown> = { deleted_at: null }
    if (filter.category) where.category = filter.category
    if (filter.typeCode) where.type_code = filter.typeCode
    if (filter.dietaryAttribute) {
      where.product_dietary = { some: { attribute: filter.dietaryAttribute } }
    }
    const rows = await this.db.product.findMany({
      where,
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
    validateCategoryFields(draft.category, draft)
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
    validateCategoryFields(patch.category ?? existing.category, patch)
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
    const updated = await this.db.$transaction(
      async (tx) => {
        const current = await tx.product.findFirst({ where: { id, deleted_at: null }, select: { category: true } })
        if (!current) throw new ApiErrorException('NOT_FOUND', 'Product not found.', 404)
        const category = patch.category ?? current.category
        validateCategoryFields(category, patch)
        const typeCode = category === 'meal' ? patch.typeCode : 'STD'
        const isPremium = category === 'meal' ? patch.isPremium : false
        const dietary = category === 'duty_free' ? [] : patch.dietaryAttributes
        const shelfLifeDays = category === 'duty_free' ? null : patch.shelfLifeDays
        await tx.product.update({
          where: { id },
          data: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.sku !== undefined ? { sku: patch.sku } : {}),
            ...(patch.category !== undefined ? { category: patch.category } : {}),
            ...(typeCode !== undefined ? { type_code: typeCode } : {}),
            ...(patch.priceAmount !== undefined ? { price_amount: patch.priceAmount } : {}),
            ...(patch.purchaseCostAmount !== undefined ? { purchase_cost_amount: patch.purchaseCostAmount } : {}),
            ...(shelfLifeDays !== undefined ? { shelf_life_days: shelfLifeDays } : {}),
            ...(isPremium !== undefined ? { is_premium: isPremium } : {}),
            ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
            ...(imageKey !== undefined ? { image_key: imageKey, image_updated_at: imageKey ? new Date() : null } : {}),
          },
        })
        if (dietary !== undefined) {
          await tx.product_dietary.deleteMany({ where: { product_id: id } })
          if (dietary.length > 0) {
            await tx.product_dietary.createMany({
              data: dietary.map((attribute) => ({ product_id: id, attribute })),
            })
          }
        }
        return tx.product.findUniqueOrThrow({ where: { id }, include: { product_dietary: true } })
      },
      { isolationLevel: 'Serializable' },
    )
    return { product: await this.toDto(updated) }
  }

  // Soft delete: refuse if the product is still in use. It is in use
  // when it has stock in a warehouse, stock on an aircraft, a line on
  // an open customer order or a line on a catering order that is not
  // closed yet.
  async remove(id: string): Promise<void> {
    const existing = await this.db.product.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Product not found.', 404)

    const onHand = await this.db.warehouse_stock.count({ where: { product_id: id, quantity_on_hand: { gt: 0 } } })
    const batchLeft = await this.db.stock_batch.count({ where: { product_id: id, quantity_remaining: { gt: 0 } } })
    const inAircraft = await this.db.aircraft_stock.count({ where: { product_id: id, quantity: { gt: 0 } } })
    const onCustomerOrder = await this.db.product_order_line.count({
      where: {
        product_id: id,
        deleted_at: null,
        product_order: { status: { in: ['pending_payment', 'confirmed'] } },
      },
    })
    const onCateringOrder = await this.db.catering_order_line.count({
      where: {
        product_id: id,
        catering_order: { status: { notIn: ['closed', 'void'] } },
      },
    })

    const reason = productInUseReason({
      warehouseStock: onHand + batchLeft,
      aircraftStock: inAircraft,
      openCustomerOrder: onCustomerOrder,
      openCateringOrder: onCateringOrder,
    })
    if (reason) {
      throw new ApiErrorException('PRODUCT_IN_USE', productInUseMessage(reason), 409, { reason })
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
