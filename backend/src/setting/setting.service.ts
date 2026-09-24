import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePostingPolicyDto } from './dto/update-posting-policy.dto';

// Service untuk mengelola Pengaturan Kebijakan Posting per Tenant
@Injectable()
export class SettingService {
  constructor(private readonly prisma: PrismaService) {}

  // Mendapatkan kebijakan posting jurnal per tenant
  async getPostingPolicy(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant dengan ID ${tenantId} tidak ditemukan`);
    }

    let setting = await this.prisma.postingPolicySetting.findUnique({
      where: { tenantId },
    });

    // Jika belum ada record pengaturan, buatkan default AUTO_POST
    if (!setting) {
      setting = await this.prisma.postingPolicySetting.create({
        data: {
          tenantId,
          mode: 'AUTO_POST',
          updatedBy: 'System Auto-Initialization',
        },
      });
    }

    return setting;
  }

  // Mengubah kebijakan posting jurnal per tenant
  async updatePostingPolicy(
    tenantId: string,
    updatePostingPolicyDto: UpdatePostingPolicyDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant dengan ID ${tenantId} tidak ditemukan`);
    }

    return this.prisma.postingPolicySetting.upsert({
      where: { tenantId },
      update: {
        mode: updatePostingPolicyDto.mode,
        updatedBy: updatePostingPolicyDto.updatedBy ?? 'Tenant Admin',
      },
      create: {
        tenantId,
        mode: updatePostingPolicyDto.mode,
        updatedBy: updatePostingPolicyDto.updatedBy ?? 'Tenant Admin',
      },
    });
  }
}
