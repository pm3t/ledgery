import { Module } from '@nestjs/common';
import { AccountingPeriodController } from './accounting-period.controller';
import { AccountingPeriodService } from './accounting-period.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AccountingPeriodController],
  providers: [AccountingPeriodService],
  exports: [AccountingPeriodService]
})
export class AccountingPeriodModule {}
