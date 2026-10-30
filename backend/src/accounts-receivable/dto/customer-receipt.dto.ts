import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReceiptAllocationDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  creditNoteId?: string;

  @IsNumber()
  @Min(0.0001)
  jumlahAlokasi: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  kursAlokasi?: number;
}

export class CreateCustomerReceiptDto {
  @IsString()
  @IsNotEmpty()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  partnerId: string;

  @IsString()
  @IsNotEmpty()
  akunKasBankId: string;

  @IsNumber()
  @Min(0.01)
  jumlah: number;

  @IsOptional()
  @IsString()
  mata_uang?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  kurs?: number;

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReceiptAllocationDto)
  allocations?: CreateReceiptAllocationDto[];
}

