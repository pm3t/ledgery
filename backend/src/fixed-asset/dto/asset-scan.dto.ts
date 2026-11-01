import { IsString, IsNotEmpty, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ScanTagQueryDto {
  @IsString()
  @IsNotEmpty()
  tagCode: string;
}

export class CreateVerificationSessionDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsString()
  @IsNotEmpty()
  tanggal: string; // ISO date string

  @IsObject()
  cakupan: {
    locations?: string[];
    costCenters?: string[];
    categories?: string[];
  };
}

export class ScanItemDto {
  @IsString()
  @IsNotEmpty()
  tagCode: string;

  @IsObject()
  @IsOptional()
  lokasiSesi?: Record<string, any>;

  @IsString()
  @IsOptional()
  device?: string;
}

export class BatchScanVerificationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScanItemDto)
  scans: ScanItemDto[];
}

export class ApplyLocationUpdateDto {
  @IsArray()
  @IsOptional()
  assetIds?: string[];
}

export class DraftDisposalForNotFoundDto {
  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsString()
  @IsNotEmpty()
  alasan: string;
}

