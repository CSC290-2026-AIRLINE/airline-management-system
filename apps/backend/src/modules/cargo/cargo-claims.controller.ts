import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { StaffProfilesGuard } from '@backend/modules/passenger-profiles/staff-profiles.guard'
import { CargoClaimsService } from './cargo-claims.service'

class DecisionDto {
  @IsString()
  @IsIn(['approved', 'rejected'])
  decision!: string

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  approved_amount?: number

  @IsString()
  @IsNotEmpty()
  note!: string
}

@Controller('staff/cargo/claims')
@UseGuards(StaffProfilesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CargoClaimsController {
  constructor(private readonly claims: CargoClaimsService) {}

  @Get()
  listClaims(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') pageStr?: string,
    @Query('page_size') pageSizeStr?: string,
  ) {
    const page = Math.max(1, Number(pageStr) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20))
    return this.claims.listClaims({ status: status || undefined, q: q || undefined, page, pageSize })
  }

  @Get(':id')
  getClaim(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.claims.getClaim(id)
  }

  @Post(':id/decision')
  async decideClaim(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: DecisionDto, @CurrentUser() user: { id: string }) {
    const staffId = await this.claims.resolveStaffId(user.id)
    return this.claims.decideClaim(id, staffId, {
      decision: dto.decision,
      approved_amount: dto.approved_amount,
      note: dto.note,
    })
  }
}
