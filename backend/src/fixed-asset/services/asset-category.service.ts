import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssetCategoryType,
  ControlAccountType,
  DepreciationMethod,
  FiscalGroupType,
  FiscalStartRule,
} from '@prisma/client';
import { CreateAssetCategoryDto, UpdateAssetCategoryDto } from '../dto/fixed-asset.dto';

@Injectable()
export class AssetCategoryService {
  private readonly logger = new Logger(AssetCategoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Menampilkan semua kategori aset untuk tenant tertentu.
   */
  async findAll(tenantId: string) {
    return this.prisma.assetCategory.findMany({
      where: { tenantId },
      include: {
        fiscalGroup: true,
        akunAset: { select: { id: true, kode_akun: true, nama_akun: true, controlType: true } },
        akunAkumulasi: { select: { id: true, kode_akun: true, nama_akun: true, controlType: true } },
        akunBeban: { select: { id: true, kode_akun: true, nama_akun: true } },
        akunCip: { select: { id: true, kode_akun: true, nama_akun: true, controlType: true } },
        akunLabaRugiPelepasan: { select: { id: true, kode_akun: true, nama_akun: true } },
        akunRugiPenurunanNilai: { select: { id: true, kode_akun: true, nama_akun: true } },
        akunRugiPenghapusan: { select: { id: true, kode_akun: true, nama_akun: true } },
      },
      orderBy: { kode: 'asc' },
    });
  }

  /**
   * Mengambil detail satu kategori aset.
   */
  async findOne(tenantId: string, id: string) {
    const category = await this.prisma.assetCategory.findFirst({
      where: { id, tenantId },
      include: {
        fiscalGroup: true,
        akunAset: true,
        akunAkumulasi: true,
        akunBeban: true,
        akunCip: true,
        akunLabaRugiPelepasan: true,
        akunRugiPenurunanNilai: true,
        akunAkumulasiPenurunanNilai: true,
        akunRugiPenghapusan: true,
      },
    });
    if (!category) {
      throw new NotFoundException(`Kategori aset dengan ID "${id}" tidak ditemukan.`);
    }
    return category;
  }

  /**
   * Validasi akun GL untuk kategori aset:
   * - Semua akun harus ada di tenant terkait.
   * - Akun aset, akumulasi, dan CIP otomatis harus bertipe controlType FIXED_ASSET
   *   (bila belum bertipe FIXED_ASSET, otomatis perbarui ke FIXED_ASSET dan nonaktifkan direct posting).
   */
  private async validateAndEnsureControlAccounts(
    tenantId: string,
    accountIds: {
      akunAsetId: string;
      akunAkumulasiId: string;
      akunBebanId: string;
      akunCipId: string;
      akunLabaRugiPelepasanId: string;
      akunRugiPenurunanNilaiId: string;
      akunAkumulasiPenurunanNilaiId?: string;
      akunRugiPenghapusanId: string;
    },
  ) {
    const fixedAssetAccounts = [
      accountIds.akunAsetId,
      accountIds.akunAkumulasiId,
      accountIds.akunCipId,
    ];

    for (const accId of fixedAssetAccounts) {
      const acc = await this.prisma.chartOfAccount.findFirst({
        where: { id: accId, tenantId },
      });
      if (!acc) {
        throw new BadRequestException(`Akun GL ${accId} tidak ditemukan pada tenant ini.`);
      }

      // Pastikan akun kontrol FIXED_ASSET diaktifkan (non-direct posting)
      if (acc.controlType !== ControlAccountType.FIXED_ASSET || !acc.isControlAccount) {
        await this.prisma.chartOfAccount.update({
          where: { id: acc.id },
          data: {
            controlType: ControlAccountType.FIXED_ASSET,
            isControlAccount: true,
          },
        });
      }
    }

    // Validasi akun non-kontrol lainnya
    const otherAccounts = [
      accountIds.akunBebanId,
      accountIds.akunLabaRugiPelepasanId,
      accountIds.akunRugiPenurunanNilaiId,
      accountIds.akunRugiPenghapusanId,
    ];
    if (accountIds.akunAkumulasiPenurunanNilaiId) {
      otherAccounts.push(accountIds.akunAkumulasiPenurunanNilaiId);
    }

    for (const accId of otherAccounts) {
      const acc = await this.prisma.chartOfAccount.findFirst({
        where: { id: accId, tenantId },
      });
      if (!acc) {
        throw new BadRequestException(`Akun GL ${accId} tidak ditemukan.`);
      }
    }
  }

  /**
   * Membuat kategori aset baru.
   */
  async create(tenantId: string, dto: CreateAssetCategoryDto) {
    const existing = await this.prisma.assetCategory.findUnique({
      where: { tenantId_kode: { tenantId, kode: dto.kode } },
    });
    if (existing) {
      throw new ConflictException(`Kategori aset dengan kode "${dto.kode}" sudah ada.`);
    }

    // Validasi Kelompok Fiskal & Aturan Bangunan
    if (dto.fiscalGroupId) {
      const fg = await this.prisma.fiscalDepreciationGroup.findFirst({
        where: { id: dto.fiscalGroupId, tenantId },
      });
      if (!fg) {
        throw new BadRequestException(`Kelompok fiskal ${dto.fiscalGroupId} tidak valid.`);
      }

      // Aturan PMK 72/2023: Bangunan HANYA GARIS LURUS
      if (fg.jenis === FiscalGroupType.BANGUNAN && dto.metodeFiskal === DepreciationMethod.SALDO_MENURUN) {
        throw new BadRequestException('Kategori aset bangunan hanya diperkenankan menggunakan metode fiskal GARIS LURUS (PMK 72/2023).');
      }
    }

    // Validasi dan set controlType FIXED_ASSET pada akun terkait
    await this.validateAndEnsureControlAccounts(tenantId, {
      akunAsetId: dto.akunAsetId,
      akunAkumulasiId: dto.akunAkumulasiId,
      akunBebanId: dto.akunBebanId,
      akunCipId: dto.akunCipId,
      akunLabaRugiPelepasanId: dto.akunLabaRugiPelepasanId,
      akunRugiPenurunanNilaiId: dto.akunRugiPenurunanNilaiId,
      akunAkumulasiPenurunanNilaiId: dto.akunAkumulasiPenurunanNilaiId,
      akunRugiPenghapusanId: dto.akunRugiPenghapusanId,
    });

    return this.prisma.assetCategory.create({
      data: {
        tenantId,
        kode: dto.kode,
        nama: dto.nama,
        jenis: dto.jenis || AssetCategoryType.BERWUJUD,
        dapatDisusutkan: dto.dapatDisusutkan ?? true,
        metodeKomersial: dto.metodeKomersial || DepreciationMethod.GARIS_LURUS,
        faktorSaldoMenurun: dto.faktorSaldoMenurun || 2.0,
        umurManfaatBulan: dto.umurManfaatBulan || 48,
        nilaiResiduPersen: dto.nilaiResiduPersen ?? 0,
        nilaiResiduNominal: dto.nilaiResiduNominal || null,
        fiscalGroupId: dto.fiscalGroupId || null,
        metodeFiskal: dto.metodeFiskal || DepreciationMethod.GARIS_LURUS,
        aturanMulaiFiskal: dto.aturanMulaiFiskal || FiscalStartRule.BULAN_PEROLEHAN,
        akunAsetId: dto.akunAsetId,
        akunAkumulasiId: dto.akunAkumulasiId,
        akunBebanId: dto.akunBebanId,
        akunCipId: dto.akunCipId,
        akunLabaRugiPelepasanId: dto.akunLabaRugiPelepasanId,
        akunRugiPenurunanNilaiId: dto.akunRugiPenurunanNilaiId,
        akunAkumulasiPenurunanNilaiId: dto.akunAkumulasiPenurunanNilaiId || null,
        akunRugiPenghapusanId: dto.akunRugiPenghapusanId,
        isActive: true,
      },
    });
  }

  /**
   * Memperbarui kategori aset.
   */
  async update(tenantId: string, id: string, dto: UpdateAssetCategoryDto) {
    const category = await this.findOne(tenantId, id);

    // Validasi Kelompok Fiskal
    const fgId = dto.fiscalGroupId !== undefined ? dto.fiscalGroupId : category.fiscalGroupId;
    const metodeFiskal = dto.metodeFiskal || category.metodeFiskal;

    if (fgId) {
      const fg = await this.prisma.fiscalDepreciationGroup.findFirst({
        where: { id: fgId, tenantId },
      });
      if (fg?.jenis === FiscalGroupType.BANGUNAN && metodeFiskal === DepreciationMethod.SALDO_MENURUN) {
        throw new BadRequestException('Kategori aset bangunan hanya diperkenankan menggunakan metode fiskal GARIS LURUS (PMK 72/2023).');
      }
    }

    // Validasi jika akun kontrol diperbarui
    if (dto.akunAsetId || dto.akunAkumulasiId || dto.akunCipId) {
      await this.validateAndEnsureControlAccounts(tenantId, {
        akunAsetId: dto.akunAsetId || category.akunAsetId,
        akunAkumulasiId: dto.akunAkumulasiId || category.akunAkumulasiId,
        akunBebanId: dto.akunBebanId || category.akunBebanId,
        akunCipId: dto.akunCipId || category.akunCipId,
        akunLabaRugiPelepasanId: dto.akunLabaRugiPelepasanId || category.akunLabaRugiPelepasanId,
        akunRugiPenurunanNilaiId: dto.akunRugiPenurunanNilaiId || category.akunRugiPenurunanNilaiId,
        akunAkumulasiPenurunanNilaiId: dto.akunAkumulasiPenurunanNilaiId || category.akunAkumulasiPenurunanNilaiId || undefined,
        akunRugiPenghapusanId: dto.akunRugiPenghapusanId || category.akunRugiPenghapusanId,
      });
    }

    return this.prisma.assetCategory.update({
      where: { id: category.id },
      data: {
        ...(dto.nama !== undefined && { nama: dto.nama }),
        ...(dto.dapatDisusutkan !== undefined && { dapatDisusutkan: dto.dapatDisusutkan }),
        ...(dto.metodeKomersial !== undefined && { metodeKomersial: dto.metodeKomersial }),
        ...(dto.faktorSaldoMenurun !== undefined && { faktorSaldoMenurun: dto.faktorSaldoMenurun }),
        ...(dto.umurManfaatBulan !== undefined && { umurManfaatBulan: dto.umurManfaatBulan }),
        ...(dto.nilaiResiduPersen !== undefined && { nilaiResiduPersen: dto.nilaiResiduPersen }),
        ...(dto.nilaiResiduNominal !== undefined && { nilaiResiduNominal: dto.nilaiResiduNominal }),
        ...(dto.fiscalGroupId !== undefined && { fiscalGroupId: dto.fiscalGroupId }),
        ...(dto.metodeFiskal !== undefined && { metodeFiskal: dto.metodeFiskal }),
        ...(dto.aturanMulaiFiskal !== undefined && { aturanMulaiFiskal: dto.aturanMulaiFiskal }),
        ...(dto.akunAsetId !== undefined && { akunAsetId: dto.akunAsetId }),
        ...(dto.akunAkumulasiId !== undefined && { akunAkumulasiId: dto.akunAkumulasiId }),
        ...(dto.akunBebanId !== undefined && { akunBebanId: dto.akunBebanId }),
        ...(dto.akunCipId !== undefined && { akunCipId: dto.akunCipId }),
        ...(dto.akunLabaRugiPelepasanId !== undefined && { akunLabaRugiPelepasanId: dto.akunLabaRugiPelepasanId }),
        ...(dto.akunRugiPenurunanNilaiId !== undefined && { akunRugiPenurunanNilaiId: dto.akunRugiPenurunanNilaiId }),
        ...(dto.akunAkumulasiPenurunanNilaiId !== undefined && {
          akunAkumulasiPenurunanNilaiId: dto.akunAkumulasiPenurunanNilaiId,
        }),
        ...(dto.akunRugiPenghapusanId !== undefined && { akunRugiPenghapusanId: dto.akunRugiPenghapusanId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /**
   * Menghapus kategori aset bila belum memiliki aset terdaftar.
   */
  async delete(tenantId: string, id: string) {
    const category = await this.findOne(tenantId, id);

    const assetCount = await this.prisma.fixedAsset.count({
      where: { categoryId: id },
    });
    if (assetCount > 0) {
      throw new BadRequestException(
        `Kategori "${category.nama}" tidak dapat dihapus karena masih digunakan oleh ${assetCount} kartu aset.`,
      );
    }

    return this.prisma.assetCategory.delete({
      where: { id: category.id },
    });
  }
}

