import { IsNotEmpty, IsString } from 'class-validator';

// DTO untuk generate API Key baru per Tenant
export class GenerateApiKeyDto {
  @IsNotEmpty({ message: 'ID Tenant wajib diisi' })
  @IsString({ message: 'ID Tenant harus berupa teks' })
  tenantId: string;

  @IsNotEmpty({ message: 'Nama label aplikasi sumber wajib diisi (contoh: Rekan, DigiSale, Cultiva)' })
  @IsString({ message: 'Nama label harus berupa teks' })
  nama_label: string;
}
