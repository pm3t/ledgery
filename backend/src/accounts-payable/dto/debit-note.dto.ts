import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DimensionInputDto } from './purchase-bill.dto';

export class CreateDebitNoteLineDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  itemType?: 'STOCK' | 'SERVICE';

  @IsString()
  @IsNotEmpty()
  deskripsi: string;

  @IsNumber()
  @Min(0.0001)
  qty: number;

  @IsNumber()
  @Min(0)
  hargaSatuan: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  diskon?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ppnRate?: number;

  @IsOptional()
  @IsString()
  akunBiayaId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionInputDto)
  dimensions?: DimensionInputDto[];
}

export class CreateDebitNoteDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  partnerId: string;

  @IsOptional()
  @IsString()
  billId?: string;

  @IsOptional()
  @IsBoolean()
  returnStock?: boolean;

  @IsOptional()
  @IsString()
  mata_uang?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  kurs?: number;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDebitNoteLineDto)
  lines: CreateDebitNoteLineDto[];
}

