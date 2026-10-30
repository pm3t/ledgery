import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { KategoriAkun, ControlAccountType } from '@prisma/client';

// DTO untuk pendaftaran kode akun baru (Chart of Accounts)
export class CreateAccountDto {
  @IsNotEmpty({ message: 'ID Tenant tidak boleh kosong' })
  @IsString({ message: 'ID Tenant harus berupa teks' })
  tenantId: string;

  @IsNotEmpty({ message: 'Kode akun tidak boleh kosong' })
  @IsString({ message: 'Kode akun harus berupa teks' })
  kode_akun: string;

  @IsNotEmpty({ message: 'Nama akun tidak boleh kosong' })
  @IsString({ message: 'Nama akun harus berupa teks' })
  nama_akun: string;

  @IsNotEmpty({ message: 'Kategori akun wajib dipilih' })
  @IsEnum(KategoriAkun, {
    message:
      'Kategori akun harus salah satu dari: ASET, LIABILITAS, EKUITAS, PENDAPATAN, BEBAN',
  })
  kategori: KategoriAkun;

  @IsOptional()
  @IsString({ message: 'Parent ID harus berupa teks ID' })
  parentId?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive harus berupa nilai boolean' })
  isActive?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isControlAccount harus berupa nilai boolean' })
  isControlAccount?: boolean;

  @IsOptional()
  @IsEnum(ControlAccountType, {
    message: 'Tipe akun kontrol harus NONE, AR, AP, atau INVENTORY',
  })
  controlType?: ControlAccountType;
}
