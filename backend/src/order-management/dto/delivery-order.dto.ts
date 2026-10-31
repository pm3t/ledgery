import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
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

export class DeliveryOrderLineDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  soLineId?: string;

  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsNumber()
  @Min(0.0001, { message: 'Kuantitas pengiriman harus lebih besar dari 0' })
  qty: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionInputDto)
  dimensions?: DimensionInputDto[];
}

export class CreateDeliveryOrderDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsOptional()
  @IsString()
  soId?: string;

  @IsString()
  @IsNotEmpty()
  partnerId: string;

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
  @IsString()
  idempotencyKey?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryOrderLineDto)
  lines: DeliveryOrderLineDto[];
}

export class UpdateDeliveryOrderDto extends CreateDeliveryOrderDto {}

export class CreateInvoiceFromDoDto {
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
    doLineId: string;
    qty: number;
    hargaSatuan?: number;
    diskon?: number;
  }>;
}

