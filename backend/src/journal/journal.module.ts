import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';

import { PrismaModule } from '../prisma/prisma.module';
import { CurrencyModule } from '../currency/currency.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';

@Module({
  imports: [PrismaModule, CurrencyModule, AccountingPeriodModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
