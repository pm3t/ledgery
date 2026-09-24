import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { StatusLangganan } from '@prisma/client';

// DTO untuk pembaruan data tenant oleh Super Admin ABP
export class UpdateTenantDto {
  @IsOptional()
  @IsString({ message: 'Nama perusahaan harus berupa teks' })
  nama_perusahaan?: string;

  @IsOptional()
  @IsInt({ message: 'Tahun buku mulai harus berupa angka tahun' })
  @Min(2000, { message: 'Tahun buku minimal tahun 2000' })
  tahun_buku_mulai?: number;

  @IsOptional()
  @IsString({ message: 'Mata uang harus berupa kode ISO (contoh: IDR)' })
  mata_uang?: string;

  @IsOptional()
  @IsEnum(StatusLangganan, { message: 'Status langganan tidak valid' })
  status_langganan?: StatusLangganan;
}
