import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

// Service untuk mengelola siklus hidup Tenant (Super Admin ABP)
@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  // Membuat tenant baru sekaligus inisialisasi default Posting Policy Setting (AUTO_POST)
  async create(createTenantDto: CreateTenantDto) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          nama_perusahaan: createTenantDto.nama_perusahaan,
          tahun_buku_mulai: createTenantDto.tahun_buku_mulai ?? 2026,
          mata_uang: createTenantDto.mata_uang ?? 'IDR',
          status_langganan: createTenantDto.status_langganan ?? 'ACTIVE',
        },
      });

      // Membuat pengaturan posting policy default (AUTO_POST) untuk tenant baru
      await tx.postingPolicySetting.create({
        data: {
          tenantId: tenant.id,
          mode: 'AUTO_POST',
          updatedBy: 'System Onboarding',
        },
      });

      return tenant;
    });
  }

  // Mendapatkan daftar seluruh tenant (dengan statistik jumlah akun & api key)
  async findAll() {
    return this.prisma.tenant.findMany({
      include: {
        postingPolicy: true,
        _count: {
          select: {
            chartOfAccounts: true,
            apiKeys: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Mendapatkan detail satu tenant berdasarkan ID
  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        postingPolicy: true,
        apiKeys: true,
        _count: {
          select: { chartOfAccounts: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant dengan ID ${id} tidak ditemukan`);
    }

    return tenant;
  }

  // Mengubah data tenant
  async update(id: string, updateTenantDto: UpdateTenantDto) {
    await this.findOne(id); // Memastikan tenant ada

    return this.prisma.tenant.update({
      where: { id },
      data: updateTenantDto,
    });
  }

  // Menghapus tenant
  async remove(id: string) {
    await this.findOne(id); // Memastikan tenant ada

    return this.prisma.tenant.delete({
      where: { id },
    });
  }
}
