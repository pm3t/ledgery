import { IsString, IsBoolean, IsArray, ValidateIf, IsOptional, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class ManualPeriodDto {
  @IsNumber()
  nomor_periode: number;

  @IsString()
  tanggal_mulai: string;

  @IsString()
  tanggal_selesai: string;
}

export class CreateFiscalYearDto {
  @IsString()
  nama_tahun_buku: string;

  @IsString()
  tanggal_mulai: string;

  @IsString()
  tanggal_selesai: string;

  @IsBoolean()
  auto_generate: boolean;

  @ValidateIf(o => o.auto_generate === false)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualPeriodDto)
  periods?: ManualPeriodDto[];
}
