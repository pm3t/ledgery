import { Module } from '@nestjs/common';
import { JournalApprovalService } from './journal-approval.service';
import { JournalApprovalController } from './journal-approval.controller';

import { PrismaModule } from '../prisma/prisma.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';

@Module({
  imports: [PrismaModule, AccountingPeriodModule],
  controllers: [JournalApprovalController],
  providers: [JournalApprovalService],
})
export class JournalApprovalModule {}
