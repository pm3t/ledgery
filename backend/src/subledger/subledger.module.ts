import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JournalModule } from '../journal/journal.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';
import { DocumentNumberingService } from './document-numbering.service';
import { SubledgerPostingService } from './subledger-posting.service';
import { SubledgerSettingService } from './subledger-setting.service';
import { SubledgerSettingController } from './subledger-setting.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => JournalModule),
    AccountingPeriodModule,
  ],
  controllers: [SubledgerSettingController],
  providers: [
    DocumentNumberingService,
    SubledgerPostingService,
    SubledgerSettingService,
  ],
  exports: [
    DocumentNumberingService,
    SubledgerPostingService,
    SubledgerSettingService,
  ],
})
export class SubledgerModule {}

