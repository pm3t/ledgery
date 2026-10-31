import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashTransferVariant } from '@prisma/client';

export class CreateCashTransferDto {
  @IsNotEmpty({ message: 'Tanggal transaksi transfer wajib diisi' })
  @IsDateString()
  tanggal: string;

  @IsNotEmpty({ message: 'Rekening asal transfer wajib dipilih' })
  @IsString()
  dariAccountId: string;

  @IsNotEmpty({ message: 'Rekening tujuan transfer wajib dipilih' })
  @IsString()
  keAccountId: string;

  @IsNotEmpty({ message: 'Jumlah dana keluar wajib diisi' })
  @IsNumber()
  @Min(0.0001, { message: 'Jumlah dana keluar harus lebih dari 0' })
  jumlahKeluar: number;

  @IsNotEmpty({ message: 'Jumlah dana masuk wajib diisi' })
  @IsNumber()
  @Min(0.0001, { message: 'Jumlah dana masuk harus lebih dari 0' })
  jumlahMasuk: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  kurs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  biayaTransfer?: number;

  @IsOptional()
  @IsString()
  akunBiayaId?: string;

  @IsOptional()
  @IsEnum(CashTransferVariant)
  variant?: CashTransferVariant;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

