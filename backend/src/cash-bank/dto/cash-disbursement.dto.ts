import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CashDisbursementLineDto {
  @IsOptional()
  @IsString()
  akunLawanId?: string;

  @IsNotEmpty({ message: 'Deskripsi baris pengeluaran wajib diisi' })
  @IsString()
  deskripsi: string;

  @IsNotEmpty({ message: 'Jumlah pengeluaran wajib diisi' })
  @IsNumber()
  @Min(0.0001, { message: 'Jumlah pengeluaran harus lebih dari 0' })
  jumlah: number;

  @IsOptional()
  dimensions?: any;

  @IsOptional()
  @IsString()
  lineType?: 'BIAYA' | 'ASET';

  @IsOptional()
  @IsString()
  assetCategoryId?: string;

  @IsOptional()
  kapitalisasiKeCip?: boolean;

  @IsOptional()
  @IsString()
  assetId?: string;
}

export class CreateCashDisbursementDto {
  @IsNotEmpty({ message: 'Tanggal transaksi wajib diisi' })
  @IsDateString()
  tanggal: string;

  @IsNotEmpty({ message: 'Rekening kas/bank sumber pengeluaran wajib dipilih' })
  @IsString()
  cashBankAccountId: string;

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

  @IsOptional()
  @IsString()
  docVariant?: 'STANDARD' | 'PETTY_VOUCHER';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashDisbursementLineDto)
  lines: CashDisbursementLineDto[];
}

