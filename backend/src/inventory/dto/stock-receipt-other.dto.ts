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

export class CreateStockReceiptOtherLineDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(0.0001, { message: 'Kuantitas harus lebih dari 0' })
  qty: number;

  @IsNumber()
  @Min(0, { message: 'Biaya satuan tidak boleh negatif' })
  biayaSatuan: number;

  @IsOptional()
  @IsString()
  catatan?: string;
}

export class CreateStockReceiptOtherDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsNotEmpty({ message: 'Akun lawan (kredit) wajib ditentukan' })
  akunLawanId: string;

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
  @Type(() => CreateStockReceiptOtherLineDto)
  lines: CreateStockReceiptOtherLineDto[];
}

