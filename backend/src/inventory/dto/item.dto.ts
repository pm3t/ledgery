import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ItemType, InventoryValuationMethod } from '@prisma/client';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Kode barang wajib diisi' })
  kode: string;

  @IsString()
  @IsNotEmpty({ message: 'Nama barang wajib diisi' })
  nama: string;

  @IsOptional()
  @IsString()
  groupCode?: string;

  @IsOptional()
  @IsString()
  satuan?: string;

  @IsOptional()
  @IsEnum(ItemType, { message: 'Tipe barang harus STOK, NON_STOK, atau JASA' })
  tipe?: ItemType;

  @IsOptional()
  @IsString()
  akunPersediaanId?: string;

  @IsOptional()
  @IsString()
  akunHppId?: string;

  @IsOptional()
  @IsString()
  akunPendapatanId?: string;

  @IsOptional()
  @IsEnum(InventoryValuationMethod, {
    message: 'Metode valuasi harus MOVING_AVERAGE atau FIFO',
  })
  valuationMethod?: InventoryValuationMethod;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsString()
  groupCode?: string;

  @IsOptional()
  @IsString()
  satuan?: string;

  @IsOptional()
  @IsEnum(ItemType)
  tipe?: ItemType;

  @IsOptional()
  @IsString()
  akunPersediaanId?: string;

  @IsOptional()
  @IsString()
  akunHppId?: string;

  @IsOptional()
  @IsString()
  akunPendapatanId?: string;

  @IsOptional()
  @IsEnum(InventoryValuationMethod)
  valuationMethod?: InventoryValuationMethod;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ImportItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateItemDto)
  items: CreateItemDto[];
}

