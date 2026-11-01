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
import { FiscalDepreciationGroupController } from './controllers/fiscal-depreciation-group.controller';
import { AssetCategoryController } from './controllers/asset-category.controller';
import { FixedAssetController } from './controllers/fixed-asset.controller';
import { FixedAssetV1Controller } from './controllers/fixed-asset-v1.controller';
import { AssetDepreciationController } from './controllers/asset-depreciation.controller';

@Module({
  imports: [PrismaModule, SubledgerModule, AccountingPeriodModule, JournalModule],
  controllers: [
    FiscalDepreciationGroupController,
    AssetCategoryController,
    FixedAssetController,
    FixedAssetV1Controller,
    AssetDepreciationController,
  ],
  providers: [
    FiscalDepreciationGroupService,
    AssetCategoryService,
    FixedAssetService,
    FixedAssetV1Service,
    AssetStorageService,
    DepreciationEngineService,
    AssetDepreciationService,
  ],
  exports: [
    FiscalDepreciationGroupService,
    AssetCategoryService,
    FixedAssetService,
    FixedAssetV1Service,
    AssetStorageService,
    DepreciationEngineService,
    AssetDepreciationService,
  ],
})
export class FixedAssetModule {}

