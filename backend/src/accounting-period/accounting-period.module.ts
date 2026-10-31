import { Module, forwardRef } from '@nestjs/common';
import { AccountingPeriodController } from './accounting-period.controller';
import { AccountingPeriodService } from './accounting-period.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SubledgerModule } from '../subledger/subledger.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SubledgerModule),
  ],
  controllers: [AccountingPeriodController],
  providers: [AccountingPeriodService],
  exports: [AccountingPeriodService]
})
export class AccountingPeriodModule {}
