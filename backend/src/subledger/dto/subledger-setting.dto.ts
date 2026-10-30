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

