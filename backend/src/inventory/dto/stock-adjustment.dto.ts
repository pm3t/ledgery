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

export class CreateStockAdjustmentLineDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(0, { message: 'Kuantitas fisik tidak boleh bernilai negatif' })
  qtyFisik: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  biayaSatuan?: number; // Diisi jika ada selisih lebih

  @IsOptional()
  @IsString()
  catatan?: string;
}

export class CreateStockAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockAdjustmentLineDto)
  lines: CreateStockAdjustmentLineDto[];
}

