import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';

export class JournalDimensionV1Dto {
  @IsString()
  @IsNotEmpty()
  nama_dimension: string;

  @IsString()
  @IsNotEmpty()
  kode_value: string;
}

export class JournalItemV1Dto {
  @IsString()
  @IsNotEmpty()
  kode_akun: string;

  @IsNumber()
  @Min(0)
  debit: number;

  @IsNumber()
  @Min(0)
  kredit: number;

  @IsString()
  @IsOptional()
  keterangan?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalDimensionV1Dto)
  dimensions?: JournalDimensionV1Dto[];
}

export class CreateJournalV1Dto {
  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsOptional()
  deskripsi?: string;

  @IsString()
  @IsOptional()
  referensi?: string;

  @IsString()
  @IsOptional()
  idempotency_key?: string;

  @IsString()
  @IsNotEmpty()
  sumber_aplikasi: string;

  @IsString()
  @IsOptional()
  mata_uang?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalItemV1Dto)
  items: JournalItemV1Dto[];
}
