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

export class StockOpeningBalanceRowDto {
  @IsString()
  @IsNotEmpty()
  itemKode: string;

  @IsString()
  @IsNotEmpty()
  warehouseKode: string;

  @IsOptional()
  @IsString()
  tanggalMasuk?: string; // Bermanfaat untuk membedakan lapisan tanggal pada barang FIFO

  @IsNumber()
  @Min(0.0001, { message: 'Kuantitas saldo awal harus lebih dari 0' })
  qty: number;

  @IsNumber()
  @Min(0, { message: 'Biaya satuan tidak boleh negatif' })
  biayaSatuan: number;

  @IsOptional()
  @IsString()
  catatan?: string;
}

export class ImportStockOpeningBalanceDto {
  @IsString()
  @IsNotEmpty()
  asOfDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockOpeningBalanceRowDto)
  items: StockOpeningBalanceRowDto[];
}

