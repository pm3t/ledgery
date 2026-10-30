import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBusinessPartnerDto,
  UpdateBusinessPartnerDto,
} from './dto/business-partner.dto';

@Injectable()
export class BusinessPartnerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil daftar mitra bisnis dengan opsi filter pencarian, tipe (pelanggan/vendor), dan grup.
   */
  async findAll(
    tenantId: string,
    filter?: {
      search?: string;
      type?: 'CUSTOMER' | 'VENDOR' | 'ALL';
      groupCode?: string;
      isActive?: boolean;
    },
  ) {
    const where: any = { tenantId };

    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    if (filter?.groupCode) {
      where.groupCode = filter.groupCode;
    }

    if (filter?.type === 'CUSTOMER') {
      where.isCustomer = true;
    } else if (filter?.type === 'VENDOR') {
      where.isVendor = true;
    }

    if (filter?.search) {
      const term = filter.search.trim();
      where.OR = [
        { kode: { contains: term, mode: 'insensitive' } },
        { nama: { contains: term, mode: 'insensitive' } },
        { npwp: { contains: term, mode: 'insensitive' } },
        { groupCode: { contains: term, mode: 'insensitive' } },
      ];
    }

    return this.prisma.businessPartner.findMany({
      where,
      orderBy: { kode: 'asc' },
    });
  }

  /**
   * Mengambil satu mitra bisnis berdasarkan ID.
   */
  async findOne(tenantId: string, id: string) {
    const partner = await this.prisma.businessPartner.findFirst({
      where: { id, tenantId },
    });

    if (!partner) {
      throw new NotFoundException(`Mitra bisnis dengan ID '${id}' tidak ditemukan`);
    }

    return partner;
  }

  /**
   * Membuat mitra bisnis baru. Mata uang otomatis default ke mata uang tenant jika tidak dispesifikasikan.
   */
  async create(tenantId: string, dto: CreateBusinessPartnerDto) {
    // 1. Cek duplikasi kode pada tenant
    const existing = await this.prisma.businessPartner.findUnique({
      where: {
        tenantId_kode: {
          tenantId,
          kode: dto.kode.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Kode mitra bisnis '${dto.kode}' sudah digunakan pada tenant ini.`,
      );
    }

    // 2. Ambil default mata uang tenant (JANGAN di-hardcode IDR)
    let currency = dto.mata_uang;
    if (!currency) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { mata_uang: true },
      });
      currency = tenant?.mata_uang || 'IDR';
    }

    return this.prisma.businessPartner.create({
      data: {
        tenantId,
        kode: dto.kode.trim(),
        nama: dto.nama.trim(),
        npwp: dto.npwp?.trim() || null,
        alamat: dto.alamat?.trim() || null,
        kontak: dto.kontak?.trim() || null,
        termPembayaranHari: dto.termPembayaranHari ?? 30,
        creditLimit: dto.creditLimit !== undefined ? dto.creditLimit : null,
        mata_uang: currency,
        isCustomer: dto.isCustomer ?? false,
        isVendor: dto.isVendor ?? false,
        groupCode: dto.groupCode?.trim() || null,
        externalRef: dto.externalRef?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Memperbarui data mitra bisnis.
   */
  async update(tenantId: string, id: string, dto: UpdateBusinessPartnerDto) {
    await this.findOne(tenantId, id);

    if (dto.kode) {
      const duplicate = await this.prisma.businessPartner.findFirst({
        where: {
          tenantId,
          kode: dto.kode.trim(),
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new ConflictException(
          `Kode mitra '${dto.kode}' sudah digunakan oleh data mitra lain.`,
        );
      }
    }

    return this.prisma.businessPartner.update({
      where: { id },
      data: {
        ...(dto.kode && { kode: dto.kode.trim() }),
        ...(dto.nama && { nama: dto.nama.trim() }),
        ...(dto.npwp !== undefined && { npwp: dto.npwp?.trim() || null }),
        ...(dto.alamat !== undefined && { alamat: dto.alamat?.trim() || null }),
        ...(dto.kontak !== undefined && { kontak: dto.kontak?.trim() || null }),
        ...(dto.termPembayaranHari !== undefined && {
          termPembayaranHari: dto.termPembayaranHari,
        }),
        ...(dto.creditLimit !== undefined && {
          creditLimit: dto.creditLimit,
        }),
        ...(dto.mata_uang && { mata_uang: dto.mata_uang }),
        ...(dto.isCustomer !== undefined && { isCustomer: dto.isCustomer }),
        ...(dto.isVendor !== undefined && { isVendor: dto.isVendor }),
        ...(dto.groupCode !== undefined && {
          groupCode: dto.groupCode?.trim() || null,
        }),
        ...(dto.externalRef !== undefined && {
          externalRef: dto.externalRef?.trim() || null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /**
   * Menghapus mitra bisnis. Jika mitra telah terasosiasi dengan data transaksi, cegah penghapusan dan nonaktifkan (soft delete).
   */
  async remove(tenantId: string, id: string) {
    const partner = await this.findOne(tenantId, id);

    // Cek apakah partner terkait dengan data jurnal atau invoice (jika model dokumen sudah ada di masa mendatang)
    // Untuk menjaga integritas referensial dan audit trail:
    try {
      return await this.prisma.businessPartner.delete({
        where: { id },
      });
    } catch (err: any) {
      // Jika terjadi foreign key constraint violation, nonaktifkan saja
      await this.prisma.businessPartner.update({
        where: { id },
        data: { isActive: false },
      });
      throw new BadRequestException(
        `Mitra bisnis '${partner.nama}' sudah digunakan dalam dokumen/transaksi sehingga tidak dapat dihapus, namun statusnya telah diubah menjadi non-aktif.`,
      );
    }
  }

  /**
   * Impor massal mitra bisnis (dari CSV / JSON payload).
   */
  async importBatch(tenantId: string, items: CreateBusinessPartnerDto[]) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { mata_uang: true },
    });
    const defaultCurrency = tenant?.mata_uang || 'IDR';

    let createdCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      if (!item.kode || !item.nama) {
        errors.push(`Baris tanpa kode/nama dilewati`);
        continue;
      }

      const existing = await this.prisma.businessPartner.findUnique({
        where: {
          tenantId_kode: {
            tenantId,
            kode: item.kode.trim(),
          },
        },
      });

      if (existing) {
        await this.prisma.businessPartner.update({
          where: { id: existing.id },
          data: {
            nama: item.nama.trim(),
            npwp: item.npwp?.trim() || existing.npwp,
            alamat: item.alamat?.trim() || existing.alamat,
            kontak: item.kontak?.trim() || existing.kontak,
            termPembayaranHari: item.termPembayaranHari ?? existing.termPembayaranHari,
            creditLimit: item.creditLimit !== undefined ? item.creditLimit : existing.creditLimit,
            mata_uang: item.mata_uang || existing.mata_uang,
            isCustomer: item.isCustomer ?? existing.isCustomer,
            isVendor: item.isVendor ?? existing.isVendor,
            groupCode: item.groupCode?.trim() || existing.groupCode,
            externalRef: item.externalRef?.trim() || existing.externalRef,
            isActive: item.isActive ?? existing.isActive,
          },
        });
        updatedCount++;
      } else {
        await this.prisma.businessPartner.create({
          data: {
            tenantId,
            kode: item.kode.trim(),
            nama: item.nama.trim(),
            npwp: item.npwp?.trim() || null,
            alamat: item.alamat?.trim() || null,
            kontak: item.kontak?.trim() || null,
            termPembayaranHari: item.termPembayaranHari ?? 30,
            creditLimit: item.creditLimit !== undefined ? item.creditLimit : null,
            mata_uang: item.mata_uang || defaultCurrency,
            isCustomer: item.isCustomer ?? false,
            isVendor: item.isVendor ?? false,
            groupCode: item.groupCode?.trim() || null,
            externalRef: item.externalRef?.trim() || null,
            isActive: item.isActive ?? true,
          },
        });
        createdCount++;
      }
    }

    return {
      total: items.length,
      created: createdCount,
      updated: updatedCount,
      errors,
    };
  }
}

