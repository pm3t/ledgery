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
import { OrderStatus } from '@prisma/client';

export class DimensionInputDto {
  @IsString()
  @IsNotEmpty()
  nama_dimension: string;

  @IsString()
  @IsNotEmpty()
  kode_value: string;
}

export class PurchaseOrderLineDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsString()
  @IsNotEmpty()
  deskripsi: string;

  @IsNumber()
  @Min(0.0001, { message: 'Kuantitas order harus lebih besar dari 0' })
  qty: number;

  @IsNumber()
  @Min(0, { message: 'Harga satuan tidak boleh negatif' })
  harga: number;

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
  warehouseId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionInputDto)
  dimensions?: DimensionInputDto[];
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsOptional()
  @IsString()
  tanggalDiharapkan?: string;

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
  @IsEnum(OrderStatus)
  status?: OrderStatus;

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
  @Type(() => PurchaseOrderLineDto)
  lines: PurchaseOrderLineDto[];
}

export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {}

export class CreateGoodsReceiptFromPoDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsArray()
  lines?: Array<{
    poLineId: string;
    qty: number;
    biayaSatuan?: number;
  }>;
}

export class CreateBillFromPoDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  jatuhTempo: string;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsArray()
  lines?: Array<{
    poLineId: string;
    qty: number;
    hargaSatuan?: number;
    diskon?: number;
  }>;
}

