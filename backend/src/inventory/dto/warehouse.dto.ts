import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'Kode gudang wajib diisi' })
  kode: string;

  @IsString()
  @IsNotEmpty({ message: 'Nama gudang wajib diisi' })
  nama: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ImportWarehousesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWarehouseDto)
  warehouses: CreateWarehouseDto[];
}

