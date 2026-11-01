import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsBoolean, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LabelSymbology, AssetLabelStatus } from '@prisma/client';

export class CreateLabelTemplateDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsNumber()
  lebarMm: number;

  @IsNumber()
  tinggiMm: number;

  @IsObject()
  layout: Record<string, any>;

  @IsEnum(LabelSymbology)
  @IsOptional()
  simbologi?: LabelSymbology;

  @IsObject()
  @IsOptional()
  lembar?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateLabelTemplateDto {
  @IsString()
  @IsOptional()
  nama?: string;

  @IsNumber()
  @IsOptional()
  lebarMm?: number;

  @IsNumber()
  @IsOptional()
  tinggiMm?: number;

  @IsObject()
  @IsOptional()
  layout?: Record<string, any>;

  @IsEnum(LabelSymbology)
  @IsOptional()
  simbologi?: LabelSymbology;

  @IsObject()
  @IsOptional()
  lembar?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class PrintLabelsDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsArray()
  @IsOptional()
  assetIds?: string[];

  @IsObject()
  @IsOptional()
  filter?: {
    categoryId?: string;
    location?: string;
    costCenter?: string;
    statusLabel?: AssetLabelStatus;
    onlyUnlabelled?: boolean;
  };

  @IsString()
  @IsOptional()
  alasan?: string; // Wajib jika aset sudah berstatus TERCETAK / TERPASANG / RUSAK_HILANG
}

export class UpdateLabelStatusDto {
  @IsEnum(AssetLabelStatus)
  @IsNotEmpty()
  status: AssetLabelStatus;

  @IsString()
  @IsOptional()
  alasan?: string;
}

