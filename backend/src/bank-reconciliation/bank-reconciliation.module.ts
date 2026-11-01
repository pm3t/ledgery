import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubledgerModule } from '../subledger/subledger.module';
import { CashBankModule } from '../cash-bank/cash-bank.module';
import { BankAutoMatchService } from './services/bank-auto-match.service';
import { BankReconciliationService } from './services/bank-reconciliation.service';
import { BankReconciliationController } from './controllers/bank-reconciliation.controller';
import { BankStatementsV1Controller } from './controllers/bank-statements-v1.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SubledgerModule),
    forwardRef(() => CashBankModule),
  ],
  controllers: [
    BankReconciliationController,
    BankStatementsV1Controller,
  ],
  providers: [
    BankAutoMatchService,
    BankReconciliationService,
  ],
  exports: [
    BankAutoMatchService,
    BankReconciliationService,
  ],
})
export class BankReconciliationModule {}

