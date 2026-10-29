import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EntryType } from '@prisma/client';

export class JournalDimensionDto {
  @IsNotEmpty({ message: 'Nama dimensi wajib diisi' })
  @IsString({ message: 'Nama dimensi harus teks' })
  nama_dimension: string;

  @IsNotEmpty({ message: 'Kode value wajib diisi' })
  @IsString({ message: 'Kode value harus teks' })
  kode_value: string;
}

export class JournalEntryDto {
  @IsNotEmpty({ message: 'Kode akun tidak boleh kosong' })
  @IsString({ message: 'Kode akun harus berupa teks' })
  kode_akun: string;

  @IsNotEmpty({ message: 'Tipe entri wajib diisi (DEBIT/KREDIT)' })
  @IsEnum(EntryType, { message: 'Tipe harus DEBIT atau KREDIT' })
  tipe: EntryType;

  @IsNotEmpty({ message: 'Jumlah nominal wajib diisi' })
  @IsNumber({}, { message: 'Jumlah harus berupa angka' })
  jumlah: number;

  @IsOptional()
  @IsArray({ message: 'Dimensions harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => JournalDimensionDto)
  dimensions?: JournalDimensionDto[];
}

export class CreateJournalDto {
  @IsNotEmpty({ message: 'Tanggal jurnal tidak boleh kosong' })
  @IsDateString({}, { message: 'Format tanggal tidak valid (gunakan ISO-8601)' })
  tanggal: string;

  @IsNotEmpty({ message: 'Deskripsi tidak boleh kosong' })
  @IsString({ message: 'Deskripsi harus berupa teks' })
  deskripsi: string;

  @IsNotEmpty({ message: 'Sumber aplikasi tidak boleh kosong' })
  @IsString({ message: 'Sumber aplikasi harus berupa teks' })
  sumber_aplikasi: string;

  @IsOptional()
  @IsString({ message: 'Idempotency key harus berupa teks' })
  idempotency_key?: string;

  @IsOptional()
  @IsString({ message: 'Mata uang harus berupa teks' })
  mata_uang?: string;

  @IsArray({ message: 'Entries harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => JournalEntryDto)
  entries: JournalEntryDto[];
}

export class CreateManualJournalDto extends CreateJournalDto {
  @IsNotEmpty({ message: 'ID Tenant tidak boleh kosong' })
  @IsString({ message: 'ID Tenant harus berupa teks' })
  tenantId: string;
}

export class ReverseJournalDto {
  @IsNotEmpty({ message: 'ID Tenant tidak boleh kosong' })
  @IsString({ message: 'ID Tenant harus berupa teks' })
  tenantId: string;

  @IsOptional()
  @IsDateString({}, { message: 'Format tanggal reversal tidak valid (gunakan ISO-8601 / YYYY-MM-DD)' })
  tanggal?: string;

  @IsOptional()
  @IsString({ message: 'Alasan harus berupa teks' })
  alasan?: string;
}
