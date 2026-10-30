import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubledgerModule } from '../subledger/subledger.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';
import { DefaultInventoryIssueService } from './inventory-issue.service';
import { SalesInvoiceService } from './sales-invoice.service';
import { CustomerReceiptService } from './customer-receipt.service';
import { CreditNoteService } from './credit-note.service';
import { ArReportService } from './ar-report.service';
import { ArOpeningBalanceService } from './ar-opening-balance.service';
import { AccountsReceivableController } from './accounts-receivable.controller';
import { V1AccountsReceivableController } from './v1-accounts-receivable.controller';

@Module({
  imports: [PrismaModule, SubledgerModule, AccountingPeriodModule],
  controllers: [AccountsReceivableController, V1AccountsReceivableController],
  providers: [
    DefaultInventoryIssueService,
    SalesInvoiceService,
    CustomerReceiptService,
    CreditNoteService,
    ArReportService,
    ArOpeningBalanceService,
  ],
  exports: [
    DefaultInventoryIssueService,
    SalesInvoiceService,
    CustomerReceiptService,
    CreditNoteService,
    ArReportService,
    ArOpeningBalanceService,
  ],
})
export class AccountsReceivableModule {}

