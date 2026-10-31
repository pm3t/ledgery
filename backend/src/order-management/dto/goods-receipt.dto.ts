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

export class GoodsReceiptLineDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  poLineId?: string;

  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsNumber()
  @Min(0.0001, { message: 'Kuantitas penerimaan harus lebih besar dari 0' })
  qty: number;

  @IsNumber()
  @Min(0, { message: 'Biaya satuan tidak boleh negatif' })
  biayaSatuan: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionInputDto)
  dimensions?: DimensionInputDto[];
}

export class CreateGoodsReceiptDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsOptional()
  @IsString()
  poId?: string;

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
  @Type(() => GoodsReceiptLineDto)
  lines: GoodsReceiptLineDto[];
}

export class UpdateGoodsReceiptDto extends CreateGoodsReceiptDto {}

export class CreateBillFromGrDto {
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
    grLineId: string;
    qty: number;
    hargaSatuan?: number;
    diskon?: number;
  }>;
}

