import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { DbService } from '@backend/db/db.service'
import { CargoClaimsService } from './cargo-claims.service'

class FileClaimDto {
  @IsString()
  @IsIn(['damage', 'loss'])
  claim_type!: string

  @IsInt()
  @Min(1)
  pieces_affected!: number

  @IsString()
  @IsNotEmpty()
  description!: string

  @IsNumber()
  @Min(0.01)
  claimed_amount!: number
}

@Controller('cargo')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CargoCustomerController {
  constructor(
    private readonly db: DbService,
    private readonly claims: CargoClaimsService,
  ) {}

  @Post('bookings/:id/claims')
  async fileClaim(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: FileClaimDto, @CurrentUser() user: { id: string }) {
    const customerId = await this.resolveCustomerId(user.id)
    return this.claims.fileClaim(id, customerId, {
      claim_type: dto.claim_type,
      pieces_affected: dto.pieces_affected,
      description: dto.description,
      claimed_amount: dto.claimed_amount,
    })
  }

  @Get('claims')
  async listMyClaims(@CurrentUser() user: { id: string }, @Query('page') pageStr?: string, @Query('page_size') pageSizeStr?: string) {
    const customerId = await this.resolveCustomerId(user.id)
    const page = Math.max(1, Number(pageStr) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20))
    const offset = (page - 1) * pageSize

    const claims = await this.db.cargo_claim.findMany({
      where: { cargo_booking: { customer_id: customerId } },
      include: {
        cargo_claim_decision: { select: { decision: true, approved_amount: true, decided_at: true } },
        cargo_booking: { select: { booking_ref: true, awb_number: true } },
      },
      orderBy: { filed_at: 'desc' },
      skip: offset,
      take: pageSize,
    })

    const total = await this.db.cargo_claim.count({
      where: { cargo_booking: { customer_id: customerId } },
    })

    return {
      data: claims.map((c) => ({
        id: c.id,
        claimRef: c.claim_ref,
        bookingRef: c.cargo_booking.booking_ref,
        awbNumber: c.cargo_booking.awb_number,
        claimType: c.claim_type,
        piecesAffected: c.pieces_affected,
        claimedAmount: Number(c.claimed_amount),
        currency: c.currency,
        filedAt: c.filed_at,
        decision: c.cargo_claim_decision
          ? {
              decision: c.cargo_claim_decision.decision,
              approvedAmount: c.cargo_claim_decision.approved_amount ? Number(c.cargo_claim_decision.approved_amount) : null,
              decidedAt: c.cargo_claim_decision.decided_at,
            }
          : null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  private async resolveCustomerId(userId: string): Promise<string> {
    const customer = await this.db.customer.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    })
    if (!customer) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Customer account not found' } })
    }
    return customer.id
  }
}
