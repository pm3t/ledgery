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

export class CreateStockTransferLineDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(0.0001, { message: 'Kuantitas transfer harus lebih dari 0' })
  qty: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  biayaSatuan?: number;
}

export class CreateStockTransferDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  fromWarehouseId: string;

  @IsString()
  @IsNotEmpty()
  toWarehouseId: string;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferLineDto)
  lines: CreateStockTransferLineDto[];
}

