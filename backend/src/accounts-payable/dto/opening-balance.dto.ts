import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OpeningBillItemDto {
  @IsString()
  @IsNotEmpty()
  noDokumen: string;

  @IsOptional()
  @IsString()
  noFakturVendor?: string;

  @IsOptional()
  @IsString()
  nomorFakturPajakMasukan?: string;

  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  jatuhTempo: string;

  @IsString()
  @IsNotEmpty()
  partnerKode: string;

  @IsNumber()
  @Min(0.01)
  saldo: number;

  @IsOptional()
  @IsString()
  mata_uang?: string;

  @IsOptional()
  @IsNumber()
  kurs?: number;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;
}

export class ApOpeningBalanceImportDto {
  @IsString()
  @IsNotEmpty()
  asOfDate: string; // YYYY-MM-DD

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBillItemDto)
  bills: OpeningBillItemDto[];
}

