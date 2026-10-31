import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
} from 'class-validator';
import { CashBankAccountType } from '@prisma/client';

export class CreateCashBankAccountDto {
  @IsNotEmpty({ message: 'Kode rekening wajib diisi' })
  @IsString()
  kode: string;

  @IsNotEmpty({ message: 'Nama rekening wajib diisi' })
  @IsString()
  nama: string;

  @IsNotEmpty({ message: 'Jenis rekening wajib dipilih' })
  @IsEnum(CashBankAccountType)
  jenis: CashBankAccountType;

  @IsNotEmpty({ message: 'Akun GL (Chart of Account) wajib dipilih' })
  @IsString()
  chartOfAccountId: string;

  @IsOptional()
  @IsString()
  mata_uang?: string;

  @IsOptional()
  @IsString()
  namaBank?: string;

  @IsOptional()
  @IsString()
  noRekening?: string;

  @IsOptional()
  @IsString()
  namaPemilik?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  plafonKasKecil?: number;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCashBankAccountDto {
  @IsOptional()
  @IsString()
  kode?: string;

  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsEnum(CashBankAccountType)
  jenis?: CashBankAccountType;

  @IsOptional()
  @IsString()
  namaBank?: string;

  @IsOptional()
  @IsString()
  noRekening?: string;

  @IsOptional()
  @IsString()
  namaPemilik?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  plafonKasKecil?: number;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

