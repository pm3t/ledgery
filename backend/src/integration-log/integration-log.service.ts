import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntegrationLogService {
  constructor(private prisma: PrismaService) {}

  async getLogsByTenant(tenantId: string) {
    return this.prisma.integrationLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100, // batasi 100 terakhir agar ringan
    });
  }
}
