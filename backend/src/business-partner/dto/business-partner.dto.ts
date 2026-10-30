import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  IsArray,
} from 'class-validator';

export class CreateBusinessPartnerDto {
  @IsNotEmpty({ message: 'Kode mitra wajib diisi' })
  @IsString({ message: 'Kode mitra harus berupa teks' })
  kode: string;

  @IsNotEmpty({ message: 'Nama mitra wajib diisi' })
  @IsString({ message: 'Nama mitra harus berupa teks' })
  nama: string;

  @IsOptional()
  @IsString()
  npwp?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  kontak?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  termPembayaranHari?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsString()
  mata_uang?: string;

  @IsOptional()
  @IsBoolean()
  isCustomer?: boolean;

  @IsOptional()
  @IsBoolean()
  isVendor?: boolean;

  @IsOptional()
  @IsString()
  groupCode?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBusinessPartnerDto {
  @IsOptional()
  @IsString()
  kode?: string;

  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsString()
  npwp?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  kontak?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  termPembayaranHari?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsString()
  mata_uang?: string;

  @IsOptional()
  @IsBoolean()
  isCustomer?: boolean;

  @IsOptional()
  @IsBoolean()
  isVendor?: boolean;

  @IsOptional()
  @IsString()
  groupCode?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ImportBusinessPartnerDto {
  @IsArray()
  partners: CreateBusinessPartnerDto[];
}

