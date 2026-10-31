import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class IntegrationLogService {
  constructor(private prisma: PrismaService) {}

  async getLogsByTenant(tenantId: string, modul?: string) {
    const where: Prisma.IntegrationLogWhereInput = { tenantId };

    if (modul && modul !== 'ALL') {
      const m = modul.toUpperCase();
      if (m === 'AR') {
        where.OR = [
          { endpoint: { contains: '/ar', mode: 'insensitive' } },
          { endpoint: { contains: '/partners', mode: 'insensitive' } },
        ];
      } else if (m === 'AP') {
        where.OR = [
          { endpoint: { contains: '/ap', mode: 'insensitive' } },
        ];
      } else if (m === 'INVENTORY') {
        where.OR = [
          { endpoint: { contains: '/inventory', mode: 'insensitive' } },
          { endpoint: { contains: '/items', mode: 'insensitive' } },
        ];
      } else if (m === 'ORDERS') {
        where.OR = [
          { endpoint: { contains: '/order', mode: 'insensitive' } },
        ];
      } else if (m === 'JOURNALS') {
        where.endpoint = { contains: '/journals', mode: 'insensitive' };
      } else if (m === 'PERIODS') {
        where.endpoint = { contains: '/periods', mode: 'insensitive' };
      } else if (m === 'COA') {
        where.endpoint = { contains: '/chart-of-accounts', mode: 'insensitive' };
      }
    }

    return this.prisma.integrationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
