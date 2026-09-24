import { Module } from '@nestjs/common';
import { SelisihKursService } from './selisih-kurs.service';

@Module({
  providers: [SelisihKursService]
})
export class SelisihKursModule {}
