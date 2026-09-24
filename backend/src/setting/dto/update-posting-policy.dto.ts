import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PostingPolicyMode } from '@prisma/client';

// DTO untuk mengubah Kebijakan Posting Jurnal per Tenant
export class UpdatePostingPolicyDto {
  @IsNotEmpty({ message: 'Mode kebijakan posting wajib dipilih' })
  @IsEnum(PostingPolicyMode, {
    message: 'Mode harus bernilai AUTO_POST atau APPROVAL_MANUAL',
  })
  mode: PostingPolicyMode;

  @IsOptional()
  @IsString({ message: 'Nama/Email pengubah harus berupa teks' })
  updatedBy?: string;
}
