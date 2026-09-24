import { IsNotEmpty, IsString } from 'class-validator';

export class RejectJournalDto {
  @IsNotEmpty({ message: 'Alasan penolakan wajib diisi' })
  @IsString({ message: 'Alasan harus berupa teks' })
  alasan: string;
}
