// Products module wires CRUD over the F12 product catalog. PUT only
// (per spec), soft delete via deleted_at, and PHOTO_INVALID when the
// caller tries to upload something that is not a JPEG/PNG/WebP up to
// 5 MB. The image itself is stored via the StoragePort (no-op in dev);
// only the resulting image_key is persisted on the row.

import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
