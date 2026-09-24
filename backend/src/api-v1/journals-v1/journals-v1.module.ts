import { Module } from '@nestjs/common';
import { JournalsV1Controller } from './journals-v1.controller';
import { JournalModule } from '../../journal/journal.module';

@Module({
  imports: [JournalModule], // Menggunakan Service dari modul utama
  controllers: [JournalsV1Controller],
})
export class JournalsV1Module {}
