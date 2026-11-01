import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FiscalGroupType, Prisma } from '@prisma/client';
import { CreateFiscalGroupDto, UpdateFiscalGroupDto } from '../dto/fixed-asset.dto';

/**
 * Service Kelompok Penyusutan Fiskal (PMK 72/2023 menggantikan PMK-96/2009).
 * CATATAN PENTING:
 * 1. Seluruh tarif dan masa manfaat di sini adalah MASTER DATA yang WAJIB dapat diedit
 *    oleh Tenant maupun Super Admin, bukan konstanta mati di kode.
 * 2. Wajib diverifikasi ulang terhadap peraturan perpajakan terbaru yang berlaku di Indonesia.
 * 3. Kelompok default untuk kategori tanpa pemetaan adalah "Kelompok 3".
 */
@Injectable()
export class FiscalDepreciationGroupService {
  private readonly logger = new Logger(FiscalDepreciationGroupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Menampilkan semua kelompok fiskal untuk tenant tertentu.
   */
  async findAll(tenantId: string) {
    return this.prisma.fiscalDepreciationGroup.findMany({
      where: { tenantId },
      orderBy: { kode: 'asc' },
    });
  }

  /**
   * Mengambil detail satu kelompok fiskal.
   */
  async findOne(tenantId: string, id: string) {
    const group = await this.prisma.fiscalDepreciationGroup.findFirst({
      where: { id, tenantId },
    });
    if (!group) {
      throw new NotFoundException(`Kelompok fiskal dengan ID "${id}" tidak ditemukan.`);
    }
    return group;
  }

  /**
   * Membuat kelompok fiskal baru.
   */
  async create(tenantId: string, dto: CreateFiscalGroupDto) {
    const existing = await this.prisma.fiscalDepreciationGroup.findUnique({
      where: { tenantId_kode: { tenantId, kode: dto.kode } },
    });
    if (existing) {
      throw new ConflictException(`Kelompok fiskal dengan kode "${dto.kode}" sudah ada.`);
    }

    // Validasi bangunan: tidak boleh memiliki tarif saldo menurun
    if (dto.jenis === FiscalGroupType.BANGUNAN && dto.tarifSaldoMenurun) {
      throw new BadRequestException('Aset jenis BANGUNAN tidak diperkenankan menggunakan metode Saldo Menurun menurut PMK 72/2023.');
    }

    return this.prisma.fiscalDepreciationGroup.create({
      data: {
        tenantId,
        kode: dto.kode,
        nama: dto.nama,
        jenis: dto.jenis,
        masaManfaatBulan: dto.masaManfaatBulan,
        tarifGarisLurus: dto.tarifGarisLurus,
        tarifSaldoMenurun: dto.jenis === FiscalGroupType.BANGUNAN ? null : dto.tarifSaldoMenurun || null,
        isSeed: false,
      },
    });
  }

  /**
   * Memperbarui kelompok fiskal (tarif & masa manfaat dapat diubah sesuai kebijakan pajak tenant).
   */
  async update(tenantId: string, id: string, dto: UpdateFiscalGroupDto) {
    const group = await this.findOne(tenantId, id);

    if (group.jenis === FiscalGroupType.BANGUNAN && dto.tarifSaldoMenurun) {
      throw new BadRequestException('Aset jenis BANGUNAN tidak diperkenankan menggunakan metode Saldo Menurun.');
    }

    return this.prisma.fiscalDepreciationGroup.update({
      where: { id: group.id },
      data: {
        ...(dto.nama !== undefined && { nama: dto.nama }),
        ...(dto.masaManfaatBulan !== undefined && { masaManfaatBulan: dto.masaManfaatBulan }),
        ...(dto.tarifGarisLurus !== undefined && { tarifGarisLurus: dto.tarifGarisLurus }),
        ...(dto.tarifSaldoMenurun !== undefined && {
          tarifSaldoMenurun: group.jenis === FiscalGroupType.BANGUNAN ? null : dto.tarifSaldoMenurun,
        }),
      },
    });
  }

  /**
   * Menghapus kelompok fiskal bila belum digunakan oleh kategori aset.
   */
  async delete(tenantId: string, id: string) {
    const group = await this.findOne(tenantId, id);

    const usedCount = await this.prisma.assetCategory.count({
      where: { fiscalGroupId: id },
    });
    if (usedCount > 0) {
      throw new BadRequestException(
        `Kelompok fiskal "${group.kode}" tidak dapat dihapus karena masih digunakan oleh ${usedCount} kategori aset.`,
      );
    }

    return this.prisma.fiscalDepreciationGroup.delete({
      where: { id: group.id },
    });
  }

  /**
   * Seed Kelompok Penyusutan Fiskal Standar mengacu pada PMK 72/2023:
   * - Kelompok 1: 4 tahun / 48 bulan (25% Garis Lurus, 50% Saldo Menurun)
   * - Kelompok 2: 8 tahun / 96 bulan (12.5% Garis Lurus, 25% Saldo Menurun)
   * - Kelompok 3: 16 tahun / 192 bulan (6.25% Garis Lurus, 12.5% Saldo Menurun) [DEFAULT]
   * - Kelompok 4: 20 tahun / 240 bulan (5% Garis Lurus, 10% Saldo Menurun)
   * - Bangunan Permanen: 20 tahun / 240 bulan (5% Garis Lurus)
   * - Bangunan Tidak Permanen: 10 tahun / 120 bulan (10% Garis Lurus)
   * Serta opsi bidang usaha tertentu (Tanaman Keras & Ternak).
   */
  async seedFiscalGroups(tenantId: string, includeSpecificIndustries = false) {
    const standardSeeds = [
      {
        kode: 'FISKAL-1',
        nama: 'Kelompok 1 (Bukan Bangunan)',
        jenis: FiscalGroupType.BUKAN_BANGUNAN,
        masaManfaatBulan: 48,
        tarifGarisLurus: 25.0,
        tarifSaldoMenurun: 50.0,
      },
      {
        kode: 'FISKAL-2',
        nama: 'Kelompok 2 (Bukan Bangunan)',
        jenis: FiscalGroupType.BUKAN_BANGUNAN,
        masaManfaatBulan: 96,
        tarifGarisLurus: 12.5,
        tarifSaldoMenurun: 25.0,
      },
      {
        kode: 'FISKAL-3',
        nama: 'Kelompok 3 (Bukan Bangunan - Default)',
        jenis: FiscalGroupType.BUKAN_BANGUNAN,
        masaManfaatBulan: 192,
        tarifGarisLurus: 6.25,
        tarifSaldoMenurun: 12.5,
      },
      {
        kode: 'FISKAL-4',
        nama: 'Kelompok 4 (Bukan Bangunan)',
        jenis: FiscalGroupType.BUKAN_BANGUNAN,
        masaManfaatBulan: 240,
        tarifGarisLurus: 5.0,
        tarifSaldoMenurun: 10.0,
      },
      {
        kode: 'FISKAL-BP',
        nama: 'Bangunan Permanen',
        jenis: FiscalGroupType.BANGUNAN,
        masaManfaatBulan: 240,
        tarifGarisLurus: 5.0,
        tarifSaldoMenurun: null,
      },
      {
        kode: 'FISKAL-BNP',
        nama: 'Bangunan Tidak Permanen',
        jenis: FiscalGroupType.BANGUNAN,
        masaManfaatBulan: 120,
        tarifGarisLurus: 10.0,
        tarifSaldoMenurun: null,
      },
    ];

    if (includeSpecificIndustries) {
      standardSeeds.push(
        {
          kode: 'FISKAL-TANAMAN-KERAS',
          nama: 'Tanaman Keras (Bidang Usaha Tertentu - 20 Th)',
          jenis: FiscalGroupType.BUKAN_BANGUNAN,
          masaManfaatBulan: 240,
          tarifGarisLurus: 5.0,
          tarifSaldoMenurun: 10.0,
        },
        {
          kode: 'FISKAL-TERNAK-1',
          nama: 'Ternak Kelompok 1 (Bidang Usaha Tertentu - 4 Th)',
          jenis: FiscalGroupType.BUKAN_BANGUNAN,
          masaManfaatBulan: 48,
          tarifGarisLurus: 25.0,
          tarifSaldoMenurun: 50.0,
        },
        {
          kode: 'FISKAL-TERNAK-2',
          nama: 'Ternak Kelompok 2 (Bidang Usaha Tertentu - 8 Th)',
          jenis: FiscalGroupType.BUKAN_BANGUNAN,
          masaManfaatBulan: 96,
          tarifGarisLurus: 12.5,
          tarifSaldoMenurun: 25.0,
        },
      );
    }

    let createdCount = 0;
    for (const s of standardSeeds) {
      const exists = await this.prisma.fiscalDepreciationGroup.findUnique({
        where: { tenantId_kode: { tenantId, kode: s.kode } },
      });
      if (!exists) {
        await this.prisma.fiscalDepreciationGroup.create({
          data: {
            tenantId,
            kode: s.kode,
            nama: s.nama,
            jenis: s.jenis,
            masaManfaatBulan: s.masaManfaatBulan,
            tarifGarisLurus: s.tarifGarisLurus,
            tarifSaldoMenurun: s.tarifSaldoMenurun,
            isSeed: true,
          },
        });
        createdCount++;
      }
    }

    this.logger.log(`Seeded ${createdCount} fiscal groups for tenant ${tenantId}`);
    return { createdCount };
  }
}

