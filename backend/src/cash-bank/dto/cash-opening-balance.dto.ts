import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CashOpeningBalanceItemDto {
  @IsNotEmpty({ message: 'ID rekening wajib diisi' })
  @IsString()
  cashBankAccountId: string;

  @IsNotEmpty({ message: 'Saldo awal wajib diisi' })
  @IsNumber()
  saldoAwal: number;

  @IsOptional()
  @IsString()
  keterangan?: string;
}

export class ImportCashOpeningBalanceDto {
  @IsNotEmpty({ message: 'Tanggal cut-off go-live saldo awal wajib diisi' })
  @IsDateString()
  tanggal: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashOpeningBalanceItemDto)
  items: CashOpeningBalanceItemDto[];
}

