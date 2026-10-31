import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubledgerModule } from '../subledger/subledger.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';
import { JournalModule } from '../journal/journal.module';
import { SelisihKursModule } from '../selisih-kurs/selisih-kurs.module';
import { DimensionModule } from '../dimension/dimension.module';

import { CashBankCaptureService } from './services/cash-bank-capture.service';
import { CashBankAccountService } from './services/cash-bank-account.service';
import { CashDocumentService } from './services/cash-document.service';
import { CashOpeningBalanceService } from './services/cash-opening-balance.service';
import { CashBankReportService } from './services/cash-bank-report.service';

import { CashBankController } from './controllers/cash-bank.controller';
import { CashBankReportController } from './controllers/cash-bank-report.controller';
import { CashBankV1Controller } from './controllers/cash-bank-v1.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SubledgerModule),
    AccountingPeriodModule,
    forwardRef(() => JournalModule),
    SelisihKursModule,
    DimensionModule,
  ],
  controllers: [
    CashBankController,
    CashBankReportController,
    CashBankV1Controller,
  ],
  providers: [
    CashBankCaptureService,
    CashBankAccountService,
    CashDocumentService,
    CashOpeningBalanceService,
    CashBankReportService,
  ],
  exports: [
    CashBankCaptureService,
    CashBankAccountService,
    CashDocumentService,
    CashOpeningBalanceService,
    CashBankReportService,
  ],
})
export class CashBankModule {}
