import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { ChartOfAccountModule } from './chart-of-account/chart-of-account.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { SettingModule } from './setting/setting.module';
import { JournalModule } from './journal/journal.module';
import { GeneralLedgerModule } from './general-ledger/general-ledger.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationModule } from './notification/notification.module';
import { JournalApprovalModule } from './journal-approval/journal-approval.module';
import { FinancialReportModule } from './financial-report/financial-report.module';
import { TaxModule } from './tax/tax.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { JournalsV1Module } from './api-v1/journals-v1/journals-v1.module';
import { CoaV1Module } from './api-v1/coa-v1/coa-v1.module';
import { PeriodsV1Module } from './api-v1/periods-v1/periods-v1.module';
import { IntegrationLogModule } from './integration-log/integration-log.module';
import { AuthModule } from './auth/auth.module';
import { UserManagementModule } from './user-management/user-management.module';
import { DimensionModule } from './dimension/dimension.module';
import { CurrencyModule } from './currency/currency.module';
import { SelisihKursModule } from './selisih-kurs/selisih-kurs.module';
import { AccountingPeriodModule } from './accounting-period/accounting-period.module';

// Modul Utama Aplikasi Backend Ledgery
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    TenantModule,
    ChartOfAccountModule,
    ApiKeyModule,
    SettingModule,
    JournalModule,
    GeneralLedgerModule,
    EventEmitterModule.forRoot(),
    NotificationModule,
    JournalApprovalModule,
    FinancialReportModule,
    TaxModule,
    SuperAdminModule,
    JournalsV1Module,
    CoaV1Module,
    PeriodsV1Module,
    IntegrationLogModule,
    AuthModule,
    UserManagementModule,
    DimensionModule,
    CurrencyModule,
    SelisihKursModule,
    AccountingPeriodModule,
  ],
})
export class AppModule {}
