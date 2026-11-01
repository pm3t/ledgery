import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BankImportNominalMode, BankMatchStatus } from '@prisma/client';

export class PemetaanKolomDto {
  @IsNumber()
  tanggalCol: number;

  @IsNumber()
  keteranganCol: number;

  @IsOptional()
  @IsNumber()
  referensiCol?: number;

  @IsOptional()
  @IsNumber()
  debitCol?: number;

  @IsOptional()
  @IsNumber()
  kreditCol?: number;

  @IsOptional()
  @IsNumber()
  nominalCol?: number; // jika SATU_KOLOM_BERTANDA

  @IsOptional()
  @IsNumber()
  saldoCol?: number;

  @IsOptional()
  @IsNumber()
  startRow?: number; // baris mulai data (default 1 setelah header)
}

export class SaveBankImportTemplateDto {
  @IsString()
  @IsNotEmpty()
  cashBankAccountId: string;

  @ValidateNested()
  @Type(() => PemetaanKolomDto)
  pemetaanKolom: PemetaanKolomDto;

  @IsString()
  @IsNotEmpty()
  formatTanggal: string;

  @IsString()
  @IsNotEmpty()
  pemisahDesimal: string;

  @IsString()
  @IsNotEmpty()
  pemisahRibuan: string;

  @IsEnum(BankImportNominalMode)
  modeNominal: BankImportNominalMode;
}

export class StatementLineInputDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  keterangan: string;

  @IsOptional()
  @IsString()
  referensi?: string;

  @IsOptional()
  @IsNumber()
  debit?: number;

  @IsOptional()
  @IsNumber()
  kredit?: number;

  @IsOptional()
  @IsNumber()
  saldo?: number;

  @IsOptional()
  @IsString()
  externalRef?: string;
}

export class ImportStatementLinesDto {
  @IsString()
  @IsNotEmpty()
  cashBankAccountId: string;

  @IsString()
  @IsNotEmpty()
  namaFile: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatementLineInputDto)
  lines: StatementLineInputDto[];

  @IsOptional()
  @IsNumber()
  saldoAwal?: number;

  @IsOptional()
  @IsNumber()
  saldoAkhir?: number;
}

export class AllocationItemDto {
  @IsString()
  @IsNotEmpty()
  cashBankEntryId: string;

  @IsNumber()
  jumlahAlokasi: number;
}

export class ManualMatchDto {
  @IsString()
  @IsNotEmpty()
  statementLineId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  allocations: AllocationItemDto[];
}

export class MatchRecommendationDto {
  @IsString()
  @IsNotEmpty()
  statementLineId: string;

  @IsArray()
  @IsString({ each: true })
  cashBankEntryIds: string[];
}

export class BatchAcceptMatchesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchRecommendationDto)
  matches: MatchRecommendationDto[];
}

export class IgnoreStatementLineDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class CreateAdjustmentDocDto {
  @IsString()
  @IsNotEmpty()
  statementLineId: string;

  @IsString()
  @IsNotEmpty()
  akunLawanId: string;

  @IsOptional()
  @IsString()
  keterangan?: string;
}

export class CompleteReconciliationDto {
  @IsString()
  @IsNotEmpty()
  cashBankAccountId: string;

  @IsString()
  @IsNotEmpty()
  tanggalAkhir: string;

  @IsNumber()
  saldoRekeningKoran: number;
}

export class ReopenReconciliationDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

