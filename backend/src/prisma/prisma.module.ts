import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Modul Prisma yang dideklarasikan secara Global agar bisa digunakan di seluruh modul NestJS
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
