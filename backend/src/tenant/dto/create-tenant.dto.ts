import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { StatusLangganan } from '@prisma/client';

// DTO untuk pendaftaran tenant baru oleh Super Admin ABP
export class CreateTenantDto {
  @IsNotEmpty({ message: 'Nama perusahaan wajib diisi' })
  @IsString({ message: 'Nama perusahaan harus berupa teks' })
  nama_perusahaan: string;

  @IsOptional()
  @IsInt({ message: 'Tahun buku mulai harus berupa angka tahun (contoh: 2026)' })
  @Min(2000, { message: 'Tahun buku minimal tahun 2000' })
  tahun_buku_mulai?: number;

  @IsOptional()
  @IsString({ message: 'Mata uang harus berupa kode ISO (contoh: IDR)' })
  mata_uang?: string;

  @IsOptional()
  @IsEnum(StatusLangganan, { message: 'Status langganan tidak valid (ACTIVE, INACTIVE, TRIAL)' })
  status_langganan?: StatusLangganan;
}
