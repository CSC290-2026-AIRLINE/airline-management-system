import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Post, Query, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { ListExpensesDto } from './dto/list-expenses.dto'
import { UpdateExpenseDto } from './dto/update-expense.dto'
import { ExpenseService } from './expense.service'
import { pricingValidationPipe } from '../../pricing.pipes'

@Controller('staff/expenses')
@UsePipes(pricingValidationPipe)
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Get()
  findAll(@Query() query: ListExpensesDto) {
    return this.expenseService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenseService.create(dto, user.id)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenseService.update(id, dto, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenseService.remove(id, user.id)
  }
}
