import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KategoriAkun, PostingPolicyMode } from '@prisma/client';

@Injectable()
export class SuperAdminService {
  constructor(private prisma: PrismaService) {}

  // 1. Onboarding Tenant (termasuk CoA template dan Posting Policy)
  async onboardTenant(data: { nama_perusahaan: string; tahun_buku_mulai: number; mata_uang: string }) {
    return this.prisma.$transaction(async (tx) => {
      // Buat Tenant
      const tenant = await tx.tenant.create({
        data: {
          nama_perusahaan: data.nama_perusahaan,
          tahun_buku_mulai: data.tahun_buku_mulai,
          mata_uang: data.mata_uang,
          // Trial 30 hari untuk penagihan
          billingDueDate: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000), 
        },
      });

      // Default Posting Policy (AUTO_POST)
      await tx.postingPolicySetting.create({
        data: {
          tenantId: tenant.id,
          mode: PostingPolicyMode.AUTO_POST,
          updatedBy: 'SYSTEM_ONBOARDING',
        }
      });

      // Template CoA Dasar
      const coaTemplate = [
        { kode: '100000', nama: 'ASET LANCAR', kat: KategoriAkun.ASET },
        { kode: '200000', nama: 'LIABILITAS JANGKA PENDEK', kat: KategoriAkun.LIABILITAS },
        { kode: '300000', nama: 'EKUITAS PERUSAHAAN', kat: KategoriAkun.EKUITAS },
        { kode: '400000', nama: 'PENDAPATAN OPERASIONAL', kat: KategoriAkun.PENDAPATAN },
        { kode: '600000', nama: 'BEBAN OPERASIONAL', kat: KategoriAkun.BEBAN },
      ];

      for (const c of coaTemplate) {
        await tx.chartOfAccount.create({
          data: {
            tenantId: tenant.id,
            kode_akun: c.kode,
            nama_akun: c.nama,
            kategori: c.kat,
          }
        });
      }

      return tenant;
    });
  }

  // 2. Daftar Tenant (beserta status billing)
  async getAllTenants() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  // 3. Update Billing
  async updateBilling(tenantId: string, status: 'PAID' | 'UNPAID' | 'OVERDUE', extendedDays?: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }});
    if (!tenant) throw new NotFoundException('Tenant not found');

    let newDueDate = tenant.billingDueDate;
    if (extendedDays && newDueDate) {
      newDueDate = new Date(newDueDate.getTime() + extendedDays * 24 * 60 * 60 * 1000);
    } else if (extendedDays && !newDueDate) {
      newDueDate = new Date(new Date().getTime() + extendedDays * 24 * 60 * 60 * 1000);
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        billingStatus: status,
        billingDueDate: newDueDate,
      }
    });
  }

  // 4. Monitoring: Aplikasi Terhubung
  async getConnectedApps(tenantId: string) {
    // Kita mencari distinct `sumber_aplikasi` dari tabel Journal
    const apps = await this.prisma.journal.groupBy({
      by: ['sumber_aplikasi'],
      where: { tenantId },
      _count: { id: true },
      _max: { createdAt: true },
    });

    return apps.map(app => ({
      namaAplikasi: app.sumber_aplikasi,
      jumlahJurnal: app._count.id,
      terakhirKirim: app._max.createdAt,
    }));
  }

  // 5. Audit Log (Write & Read)
  async logAccess(actorRole: string, action: string, targetTenantId: string, deskripsi: string) {
    return this.prisma.auditLog.create({
      data: {
        actorRole,
        action,
        targetTenantId,
        deskripsi
      }
    });
  }

  async getAuditLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100, // Ambil 100 terakhir
    });
  }

  // 6. Daftar Semua API Keys
  async getAllApiKeys() {
    return this.prisma.apiKey.findMany({
      include: {
        tenant: {
          select: { nama_perusahaan: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
