import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubledgerModule } from '../subledger/subledger.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DefaultInventoryReceiptService } from './inventory-receipt.service';
import { PurchaseBillService } from './purchase-bill.service';
import { VendorPaymentService } from './vendor-payment.service';
import { DebitNoteService } from './debit-note.service';
import { ApReportService } from './ap-report.service';
import { ApOpeningBalanceService } from './ap-opening-balance.service';
import { AccountsPayableController } from './accounts-payable.controller';
import { V1AccountsPayableController } from './v1-accounts-payable.controller';

@Module({
  imports: [
    PrismaModule,
    SubledgerModule,
    AccountingPeriodModule,
    forwardRef(() => InventoryModule),
  ],
  controllers: [AccountsPayableController, V1AccountsPayableController],
  providers: [
    DefaultInventoryReceiptService,
    PurchaseBillService,
    VendorPaymentService,
    DebitNoteService,
    ApReportService,
    ApOpeningBalanceService,
  ],
  exports: [
    DefaultInventoryReceiptService,
    PurchaseBillService,
    VendorPaymentService,
    DebitNoteService,
    ApReportService,
    ApOpeningBalanceService,
  ],
})
export class AccountsPayableModule {}

