// OnboardProductsModule: F12 root module. Wires every sub-module and
// the cross-module ports (ClockPort, FlightsPort, BookingsPort,
// PaymentsPort, TierPort, StoragePort, AuditPort). The F12
// exception filter is registered globally here so every sub-route
// emits the spec-mandated { error: { code, message, details? } }
// envelope.

import { Global, Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { F12ExceptionFilter } from './common/exception.filter'
import { SystemClock } from './common/clock'
import { AuditService } from './common/audit.service'
import { FlightsService } from './common/flights.service'
import { NoopStorageService, StubBookingsService, StubPaymentsService, StubTierService } from './common/cross-module-ports'
import { ProductsModule } from './products/products.module'
import { OfferingsModule } from './offerings/offerings.module'
import { CabinSettingsModule } from './cabin-settings/cabin-settings.module'
import { WarehousesModule } from './warehouses/warehouses.module'
import { SuppliersModule } from './suppliers/suppliers.module'
import { PurchaseReceiptsModule } from './purchase-receipts/purchase-receipts.module'
import { StockBatchesModule } from './stock-batches/stock-batches.module'
import { StockMovementsModule } from './stock-movements/stock-movements.module'
import { CateringOrdersModule } from './catering-orders/catering-orders.module'
import { StockTransfersModule } from './stock-transfers/stock-transfers.module'
import { AircraftStockModule } from './aircraft-stock/aircraft-stock.module'
import { FlightReportModule } from './flight-report/flight-report.module'
import { SalesModule } from './sales/sales.module'

@Global()
@Module({
  imports: [
    ProductsModule,
    OfferingsModule,
    CabinSettingsModule,
    WarehousesModule,
    SuppliersModule,
    PurchaseReceiptsModule,
    StockBatchesModule,
    StockMovementsModule,
    StockTransfersModule,
    CateringOrdersModule,
    AircraftStockModule,
    SalesModule,
    FlightReportModule,
  ],
  providers: [
    SystemClock,
    AuditService,
    FlightsService,
    NoopStorageService,
    StubBookingsService,
    StubPaymentsService,
    StubTierService,
    { provide: APP_FILTER, useClass: F12ExceptionFilter },
  ],
  exports: [SystemClock, AuditService, FlightsService, NoopStorageService, StubBookingsService, StubPaymentsService, StubTierService],
})
export class OnboardProductsModule {}
