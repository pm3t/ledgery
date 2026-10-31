import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DimensionInputDto {
  @IsString()
  @IsNotEmpty()
  nama_dimension: string;

  @IsString()
  @IsNotEmpty()
  kode_value: string;
}

export class CreateSalesInvoiceLineDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

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
  ppnRate?: number; // e.g. 11 for 11%

  @IsOptional()
  @IsString()
  akunPendapatanId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionInputDto)
  dimensions?: DimensionInputDto[];

  @IsOptional()
  @IsEnum(['SO_LINE', 'DO_LINE'])
  sourceLineType?: 'SO_LINE' | 'DO_LINE';

  @IsOptional()
  @IsString()
  sourceLineId?: string;
}

export class CreateSalesInvoiceDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  jatuhTempo: string;

  @IsString()
  @IsNotEmpty()
  partnerId: string;

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
  @Type(() => CreateSalesInvoiceLineDto)
  lines: CreateSalesInvoiceLineDto[];
}

export class UpdateSalesInvoiceDto extends CreateSalesInvoiceDto {}

