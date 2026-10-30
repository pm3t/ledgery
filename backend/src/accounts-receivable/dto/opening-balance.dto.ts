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

export class OpeningInvoiceItemDto {
  @IsString()
  @IsNotEmpty()
  noDokumen: string;

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

export class OpeningBalanceImportDto {
  @IsString()
  @IsNotEmpty()
  asOfDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningInvoiceItemDto)
  invoices: OpeningInvoiceItemDto[];
}

