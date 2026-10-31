import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubledgerModule } from '../subledger/subledger.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';
import { MovingAverageStrategy } from './strategies/moving-average.strategy';
import { FifoStrategy } from './strategies/fifo.strategy';
import { ValuationStrategyFactory } from './strategies/valuation-strategy.factory';
import { ItemService } from './services/item.service';
import { WarehouseService } from './services/warehouse.service';
import { InventoryStockService } from './services/inventory-stock.service';
import { ConcreteInventoryReceiptService } from './services/inventory-receipt.service';
import { ConcreteInventoryIssueService } from './services/inventory-issue.service';
import { StockReceiptOtherService } from './services/stock-receipt-other.service';
import { StockAdjustmentService } from './services/stock-adjustment.service';
import { StockTransferService } from './services/stock-transfer.service';
import { InventoryReportService } from './services/inventory-report.service';
import { InventoryOpeningBalanceService } from './services/inventory-opening-balance.service';
import { InventoryController } from './inventory.controller';
import { V1InventoryController } from './v1-inventory.controller';

@Module({
  imports: [
    PrismaModule,
    SubledgerModule,
    AccountingPeriodModule,
  ],
  controllers: [InventoryController, V1InventoryController],
  providers: [
    MovingAverageStrategy,
    FifoStrategy,
    ValuationStrategyFactory,
    ItemService,
    WarehouseService,
    InventoryStockService,
    ConcreteInventoryReceiptService,
    ConcreteInventoryIssueService,
    StockReceiptOtherService,
    StockAdjustmentService,
    StockTransferService,
    InventoryReportService,
    InventoryOpeningBalanceService,
  ],
  exports: [
    ItemService,
    WarehouseService,
    InventoryStockService,
    ConcreteInventoryReceiptService,
    ConcreteInventoryIssueService,
    ValuationStrategyFactory,
    StockReceiptOtherService,
    StockAdjustmentService,
    StockTransferService,
    InventoryReportService,
    InventoryOpeningBalanceService,
  ],
})
export class InventoryModule {}

