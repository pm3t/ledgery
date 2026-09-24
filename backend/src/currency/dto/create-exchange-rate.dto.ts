import { IsString, IsNotEmpty, IsNumber, IsDateString } from 'class-validator';

export class CreateExchangeRateDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  currencyId: string;

  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @IsNumber()
  @IsNotEmpty()
  kurs: number;

  @IsString()
  createdBy?: string;
}
