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
  Length,
  Matches,
} from 'class-validator';

export class JournalSourceV1Dto {
  @IsString()
  @IsOptional()
  system?: string;

  @IsString()
  @IsOptional()
  module?: string;

  @IsString()
  @IsOptional()
  event_type?: string;

  @IsString()
  @IsOptional()
  reference_type?: string;

  @IsString()
  @IsOptional()
  reference_id?: string;

  @IsString()
  @IsOptional()
  run_id?: string;
}

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
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9:_.-]+$/, {
    message: 'idempotency_key must match pattern ^[A-Za-z0-9:_.-]+$',
  })
  idempotency_key?: string;

  @IsString()
  @IsNotEmpty()
  sumber_aplikasi: string;

  @IsString()
  @IsOptional()
  mata_uang?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => JournalSourceV1Dto)
  source?: JournalSourceV1Dto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalItemV1Dto)
  items: JournalItemV1Dto[];
}
