import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubledgerModule } from '../subledger/subledger.module';
import { AccountingPeriodModule } from '../accounting-period/accounting-period.module';
import { JournalModule } from '../journal/journal.module';
import { FiscalDepreciationGroupService } from './services/fiscal-depreciation-group.service';
import { AssetCategoryService } from './services/asset-category.service';
import { FixedAssetService } from './services/fixed-asset.service';
import { FixedAssetV1Service } from './services/fixed-asset-v1.service';
import { AssetStorageService } from './services/storage.service';
import { DepreciationEngineService } from './services/depreciation-engine.service';
import { AssetDepreciationService } from './services/asset-depreciation.service';
import { AssetLifecycleService } from './services/asset-lifecycle.service';
import { TagCodeService } from './services/tag-code.service';
import { AssetLabelService } from './services/asset-label.service';
import { AssetScanService } from './services/asset-scan.service';
import { AssetReportService } from './services/asset-report.service';
import { FiscalDepreciationGroupController } from './controllers/fiscal-depreciation-group.controller';
import { AssetCategoryController } from './controllers/asset-category.controller';
import { FixedAssetController } from './controllers/fixed-asset.controller';
import { FixedAssetV1Controller } from './controllers/fixed-asset-v1.controller';
import { AssetDepreciationController } from './controllers/asset-depreciation.controller';
import { AssetLifecycleController } from './controllers/asset-lifecycle.controller';
import { AssetLabelController } from './controllers/asset-label.controller';
import { AssetScanController } from './controllers/asset-scan.controller';
import { AssetReportController } from './controllers/asset-report.controller';

@Module({
  imports: [PrismaModule, SubledgerModule, AccountingPeriodModule, JournalModule],
  controllers: [
    FiscalDepreciationGroupController,
    AssetCategoryController,
    FixedAssetController,
    FixedAssetV1Controller,
    AssetDepreciationController,
    AssetLifecycleController,
    AssetLabelController,
    AssetScanController,
    AssetReportController,
  ],
  providers: [
    FiscalDepreciationGroupService,
    AssetCategoryService,
    FixedAssetService,
    FixedAssetV1Service,
    AssetStorageService,
    DepreciationEngineService,
    AssetDepreciationService,
    AssetLifecycleService,
    TagCodeService,
    AssetLabelService,
    AssetScanService,
    AssetReportService,
  ],
  exports: [
    FiscalDepreciationGroupService,
    AssetCategoryService,
    FixedAssetService,
    FixedAssetV1Service,
    AssetStorageService,
    DepreciationEngineService,
    AssetDepreciationService,
    AssetLifecycleService,
    TagCodeService,
    AssetLabelService,
    AssetScanService,
    AssetReportService,
  ],
})
export class FixedAssetModule {}
