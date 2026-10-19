// OnboardProductsModule: F12 root module. Wires every sub-module and
// the cross-module ports (ClockPort, FlightsPort, BookingsPort,
// PaymentsPort, TierPort, StoragePort, AuditPort).
//
// This module does NOT register any APP_FILTER / APP_GUARD /
// APP_INTERCEPTOR / APP_PIPE provider. The F12 exception filter is
// applied per-controller via @StaffAuth; the JWT auth guard is
// registered globally in AuthModule and is not our concern.

import { Global, Module } from '@nestjs/common'
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
import { RoutesModule } from './routes/routes.module'

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
    RoutesModule,
  ],
  providers: [SystemClock, AuditService, FlightsService, NoopStorageService, StubBookingsService, StubPaymentsService, StubTierService],
  exports: [SystemClock, AuditService, FlightsService, NoopStorageService, StubBookingsService, StubPaymentsService, StubTierService],
})
export class OnboardProductsModule {}
