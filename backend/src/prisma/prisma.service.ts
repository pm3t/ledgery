import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Service Prisma untuk koneksi database PostgreSQL secara terpusat
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Inisialisasi koneksi saat modul NestJS dimulai
  async onModuleInit() {
    await this.$connect();
  }

  // Menutup koneksi saat modul NestJS dihentikan
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
