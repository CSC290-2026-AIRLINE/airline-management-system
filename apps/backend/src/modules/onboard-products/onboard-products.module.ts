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
import { AuditModule } from '../admin-console/audit/audit.module'
import { NoopStorageService, DbBookingsService, StubPaymentsService, DbTierService } from './common/cross-module-ports'
import { SharedModule } from './common/shared.module'
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
import { FlightsModule } from './flights/flights.module'
import { WarehouseStockModule } from './warehouse-stock/warehouse-stock.module'
import { ProductOrdersModule } from './product-orders/product-orders.module'
import { CatalogModule } from './catalog/catalog.module'
import { PaymentEventsModule } from './payment-events/payment-events.module'
import { PaymentsRefundsModule } from '@backend/modules/payments-refunds/payments-refunds.module'
import { OnboardPaymentsAdapter } from '@backend/modules/payments-refunds/onboard-payments.adapter'
import { SchedulerModule } from './scheduler/scheduler.module'

@Global()
@Module({
  imports: [
    PaymentsRefundsModule,
    AuditModule,
    SharedModule,
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
    FlightsModule,
    WarehouseStockModule,
    ProductOrdersModule,
    CatalogModule,
    PaymentEventsModule,
    SchedulerModule,
  ],
  providers: [
    SystemClock,
    AuditService,
    FlightsService,
    NoopStorageService,
    DbBookingsService,
    // Feature 5 takes the payments F12 asked for. The class token stays, so every service that injects it gets Feature 5's
    // adapter; the stub only wrote fake payment rows.
    { provide: StubPaymentsService, useExisting: OnboardPaymentsAdapter },
    DbTierService,
  ],
  exports: [SystemClock, AuditService, FlightsService, NoopStorageService, DbBookingsService, StubPaymentsService, DbTierService],
})
export class OnboardProductsModule {}
