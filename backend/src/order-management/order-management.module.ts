import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SubledgerModule } from '../subledger/subledger.module';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { SalesOrderService } from './services/sales-order.service';
import { DeliveryOrderService } from './services/delivery-order.service';
import { OrderReportsService } from './services/order-reports.service';
import { OrderManagementController } from './controllers/order-management.controller';
import { V1OrderManagementController } from './controllers/v1-order-management.controller';

@Module({
  imports: [
    PrismaModule,
    AccountingPeriodModule,
    InventoryModule,
    forwardRef(() => SubledgerModule),
  ],
  providers: [
    PurchaseOrderService,
    GoodsReceiptService,
    SalesOrderService,
    DeliveryOrderService,
    OrderReportsService,
  ],
  controllers: [
    OrderManagementController,
    V1OrderManagementController,
  ],
  exports: [
    PurchaseOrderService,
    GoodsReceiptService,
    SalesOrderService,
    DeliveryOrderService,
    OrderReportsService,
  ],
})
export class OrderManagementModule {}

