import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { ListExpensesDto } from './dto/list-expenses.dto'
import { UpdateExpenseDto } from './dto/update-expense.dto'
import { ExpenseService } from './expense.service'

@Controller('staff/expenses')
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

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenseService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.remove(id)
  }
}
