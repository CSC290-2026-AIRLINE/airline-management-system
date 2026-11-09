// Products HTTP surface under /api/staff/products. Creates are POST,
// edits are PUT, and there is no PATCH: list (GET), create (POST),
// update (PUT), delete (DELETE). Image upload is encoded in the same
// JSON body as a base64 data URL.

import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import { StaffAuth } from '../common/staff-auth.decorator'
import { NoopStorageService } from '../common/cross-module-ports'
import { ProductsService } from './products.service'
import { parseProductDraft, parseProductPatch } from './dto/product.dto'

@Controller('staff/products')
@StaffAuth()
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly storage: NoopStorageService,
  ) {}

  // The list filters by category, special-meal code and dietary
  // attribute.
  @Get()
  async list(
    @Query('category') category?: string,
    @Query('typeCode') typeCode?: string,
    @Query('dietaryAttribute') dietaryAttribute?: string,
  ) {
    return this.products.list({
      ...(category ? { category } : {}),
      ...(typeCode ? { typeCode } : {}),
      ...(dietaryAttribute ? { dietaryAttribute } : {}),
    })
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.products.get(id)
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown) {
    return this.products.create(parseProductDraft(body), this.storage)
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return this.products.update(id, parseProductPatch(body), this.storage)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.products.remove(id)
  }
}
