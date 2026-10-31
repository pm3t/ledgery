import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  IsString,
  Min,
  Max,
} from 'class-validator';
import {
  InventoryValuationMethod,
  CreditLimitMode,
  PostingSetupKey,
  PettyCashOverLimitMode,
  DepreciationConvention,
  LabelSymbology,
} from '@prisma/client';

export class UpdateSubledgerSettingDto {
  @IsOptional()
  @IsBoolean()
  arEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  apEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inventoryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  orderManagementEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  cashBankEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  fixedAssetEnabled?: boolean;

  @IsOptional()
  @IsEnum(InventoryValuationMethod)
  defaultValuationMethod?: InventoryValuationMethod;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  overDeliveryTolerancePct?: number;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  @IsOptional()
  @IsEnum(CreditLimitMode)
  creditLimitMode?: CreditLimitMode;

  @IsOptional()
  @IsArray()
  agingBuckets?: number[];

  @IsOptional()
  @IsBoolean()
  blockPeriodCloseOnRecon?: boolean;

  @IsOptional()
  @IsEnum(PettyCashOverLimitMode)
  pettyCashOverLimitMode?: PettyCashOverLimitMode;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  bankReconAutoMatchDays?: number;

  @IsOptional()
  @IsBoolean()
  blockPeriodCloseOnBankRecon?: boolean;

  @IsOptional()
  @IsBoolean()
  blockPeriodCloseOnDepreciation?: boolean;

  @IsOptional()
  @IsEnum(DepreciationConvention)
  depreciationConvention?: DepreciationConvention;

  @IsOptional()
  @IsBoolean()
  autoDepreciationRun?: boolean;

  @IsOptional()
  @IsString()
  tagCodePrefix?: string | null;

  @IsOptional()
  @IsString()
  tagCodeFormat?: string;

  @IsOptional()
  @IsEnum(LabelSymbology)
  labelSymbology?: LabelSymbology;
}

export class UpsertPostingSetupItemDto {
  @IsEnum(PostingSetupKey)
  key: PostingSetupKey;

  @IsString()
  accountId: string;

  @IsOptional()
  @IsString()
  groupCode?: string;
}

export class BatchUpsertPostingSetupDto {
  @IsArray()
  items: UpsertPostingSetupItemDto[];
}

