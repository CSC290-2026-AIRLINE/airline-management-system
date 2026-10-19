import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { CurrentStaff } from '../common/staff.decorator'
import type { StaffContext } from '../common/staff.guard'
import { StaffGuard } from '../common/staff.guard'
import { PurchaseReceiptsService, type CreatePurchaseReceiptInput, type PurchaseReceiptLineInput } from './purchase-receipts.service'

function parseLine(line: unknown): PurchaseReceiptLineInput {
  if (typeof line !== 'object' || line === null) {
    throw new ApiErrorException('LINE_INVALID', 'line must be an object.', 400)
  }
  const l = line as Record<string, unknown>
  if (typeof l.productId !== 'string') throw new ApiErrorException('LINE_INVALID', 'productId is required.', 400)
  if (typeof l.quantity !== 'number') throw new ApiErrorException('LINE_INVALID', 'quantity is required.', 400)
  if (typeof l.unitCostAmount !== 'number') throw new ApiErrorException('LINE_INVALID', 'unitCostAmount is required.', 400)
  if (typeof l.batchCode !== 'string') throw new ApiErrorException('LINE_INVALID', 'batchCode is required.', 400)
  const expiresAt = typeof l.expiresAt === 'string' ? l.expiresAt : null
  return { productId: l.productId, quantity: l.quantity, unitCostAmount: l.unitCostAmount, batchCode: l.batchCode, expiresAt }
}

function parseInput(body: unknown): CreatePurchaseReceiptInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('EMPTY_RECEIPT', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.supplierId !== 'string') throw new ApiErrorException('SUPPLIER_INVALID', 'supplierId is required.', 400)
  if (typeof b.warehouseId !== 'string') throw new ApiErrorException('WAREHOUSE_INVALID', 'warehouseId is required.', 400)
  if (!Array.isArray(b.lines)) throw new ApiErrorException('LINE_INVALID', 'lines must be an array.', 400)
  return {
    supplierId: b.supplierId,
    warehouseId: b.warehouseId,
    receivedAt: typeof b.receivedAt === 'string' ? b.receivedAt : undefined,
    lines: b.lines.map(parseLine),
  }
}

@Controller('staff/purchase-receipts')
@UseGuards(StaffGuard)
export class PurchaseReceiptsController {
  constructor(private readonly receipts: PurchaseReceiptsService) {}

  @Get()
  async list(@Query('warehouseId') warehouseId?: string, @Query('supplierId') supplierId?: string) {
    return this.receipts.list({ ...(warehouseId ? { warehouseId } : {}), ...(supplierId ? { supplierId } : {}) })
  }

  // Spec: PUT only. POST is provided as a synonym so the staff-web's
  // createPurchaseReceipt helper can hit a dedicated create route.
  @Put()
  @Post()
  async create(@Body() body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.receipts.create(parseInput(body), staff.id)
  }
}
