import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { KategoriAkun } from '@prisma/client';

// DTO untuk mengubah data kode akun
export class UpdateAccountDto {
  @IsOptional()
  @IsString({ message: 'Kode akun harus berupa teks' })
  kode_akun?: string;

  @IsOptional()
  @IsString({ message: 'Nama akun harus berupa teks' })
  nama_akun?: string;

  @IsOptional()
  @IsEnum(KategoriAkun, {
    message: 'Kategori akun harus ASET, LIABILITAS, EKUITAS, PENDAPATAN, atau BEBAN',
  })
  kategori?: KategoriAkun;

  @IsOptional()
  @IsString({ message: 'Parent ID harus berupa teks' })
  parentId?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive harus berupa nilai boolean' })
  isActive?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isControlAccount harus berupa nilai boolean' })
  isControlAccount?: boolean;
}
