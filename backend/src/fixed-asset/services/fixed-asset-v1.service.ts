import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentNumberingService, SubledgerDocType } from '../../subledger/document-numbering.service';
import { SubledgerPostingService } from '../../subledger/subledger-posting.service';
import {
  FixedAssetStatus,
  AssetEventType,
  AssetLabelStatus,
  AssetCapitalizationStatus,
} from '@prisma/client';
import { UpsertFixedAssetV1Dto } from '../dto/fixed-asset.dto';
import { sanitizeAssetForRole } from '../../common/asset-serializer';
import { AssetDepreciationService } from './asset-depreciation.service';

@Injectable()
export class FixedAssetV1Service {
  private readonly logger = new Logger(FixedAssetV1Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: DocumentNumberingService,
    private readonly subledgerPosting: SubledgerPostingService,
    private readonly depreciationService: AssetDepreciationService,
  ) {}

  /**
   * PUT /v1/fixed-assets/:external_ref
   * Pendaftaran atau pembaruan aset dari sistem eksternal (mis. EAM / Vigilo).
   * Bersifat IDEMPOTEN berdasarkan external_ref.
   */
  async upsertAsset(
    tenantId: string,
    externalRef: string,
    dto: UpsertFixedAssetV1Dto,
    userId?: string,
  ) {
    const existing = await this.prisma.fixedAsset.findUnique({
      where: { tenantId_externalRef: { tenantId, externalRef } },
      include: { category: true },
    });

    if (existing) {
      // Idempoten: Jika sudah ada dan status masih DRAFT/CIP, perbarui nama/deskripsi
      if (existing.status !== FixedAssetStatus.DRAFT && existing.status !== FixedAssetStatus.CIP) {
        return {
          message: 'Aset sudah terdaftar dan berstatus final (Idempoten).',
          asset: existing,
          isExisting: true,
        };
      }

      const updated = await this.prisma.fixedAsset.update({
        where: { id: existing.id },
        data: {
          nama: dto.nama,
          deskripsi: dto.deskripsi !== undefined ? dto.deskripsi : existing.deskripsi,
          dimensions: dto.dimensions !== undefined ? dto.dimensions : existing.dimensions,
        },
      });

      return {
        message: 'Aset berhasil diperbarui (Idempoten).',
        asset: updated,
        isExisting: true,
      };
    }

    // Pendaftaran Aset Baru
    const category = await this.prisma.assetCategory.findFirst({
      where: { id: dto.category_id, tenantId },
      include: { akunAset: true, akunCip: true, fiscalGroup: true },
    });
    if (!category) {
      throw new BadRequestException(`Kategori aset dengan ID "${dto.category_id}" tidak ditemukan.`);
    }

    // Validasi akun lawan jika disediakan
    let akunLawanKode: string | null = null;
    if (dto.akun_lawan_id) {
      const akunLawan = await this.prisma.chartOfAccount.findFirst({
        where: { id: dto.akun_lawan_id, tenantId },
      });
      if (!akunLawan) {
        throw new BadRequestException('Akun lawan GL tidak valid.');
      }
      akunLawanKode = akunLawan.kode_akun;
    }

    const noAset = await this.numberingService.getNextNumber(tenantId, SubledgerDocType.ASSET);
    const tagCode = dto.tag_code?.trim() || noAset;

    // Cek keunikan tagCode
    const duplicateTag = await this.prisma.fixedAsset.findUnique({
      where: { tenantId_tagCode: { tenantId, tagCode } },
    });
    if (duplicateTag) {
      throw new ConflictException(
        `Kode label / tag "${tagCode}" sudah digunakan oleh aset ${duplicateTag.noAset}. Kode label tidak boleh pernah dipakai ulang.`,
      );
    }

    const kurs = dto.kurs && dto.kurs > 0 ? dto.kurs : 1;
    const hargaPerolehanFungsional = dto.harga_perolehan * kurs;
    const isCip = dto.kapitalisasi_ke_cip ?? false;
    const status = isCip ? FixedAssetStatus.CIP : FixedAssetStatus.DRAFT;

    // Posting Jurnal GL jika akunLawan disediakan
    let journalId: string | null = null;
    if (akunLawanKode) {
      const targetAcc = isCip ? category.akunCip : category.akunAset;
      const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
        tanggal: dto.tanggal_perolehan,
        deskripsi: `Perolehan Aset Tetap V1 ${noAset} - ${dto.nama} (Ref: ${externalRef})`,
        sumber_aplikasi: 'API-V1-FIXED-ASSET',
        sourceDocType: 'FIXED_ASSET_V1',
        sourceDocId: externalRef,
        no_voucher: noAset,
        mata_uang: dto.mata_uang || 'IDR',
        entries: [
          {
            kode_akun: targetAcc.kode_akun,
            tipe: 'DEBIT',
            jumlah: hargaPerolehanFungsional,
            dimensions: dto.dimensions,
          },
          {
            kode_akun: akunLawanKode,
            tipe: 'KREDIT',
            jumlah: hargaPerolehanFungsional,
          },
        ],
      });
      journalId = journal.id;
    }

    const asset = await this.prisma.fixedAsset.create({
      data: {
        tenantId,
        noAset,
        tagCode,
        categoryId: category.id,
        nama: dto.nama,
        deskripsi: dto.deskripsi || null,
        status,
        tanggalPerolehan: new Date(dto.tanggal_perolehan),
        mata_uang: dto.mata_uang || 'IDR',
        kurs,
        hargaPerolehanAsli: dto.harga_perolehan,
        hargaPerolehan: hargaPerolehanFungsional,
        nilaiResidu: dto.nilai_residu ?? 0,
        umurManfaatBulan: dto.umur_manfaat_bulan || category.umurManfaatBulan,
        metodeKomersial: category.metodeKomersial,
        faktorSaldoMenurun: category.faktorSaldoMenurun,
        fiscalGroupId: category.fiscalGroupId,
        metodeFiskal: category.metodeFiskal,
        dimensions: dto.dimensions || null,
        statusLabel: AssetLabelStatus.BELUM_DILABEL,
        externalRef,
        sumberAplikasi: 'API-V1',
        createdBy: userId || null,
      },
    });

    await this.prisma.assetEvent.create({
      data: {
        assetId: asset.id,
        tipe: AssetEventType.PEROLEHAN,
        tanggal: asset.tanggalPerolehan,
        data: {
          sumber: 'API-V1',
          externalRef,
          hargaPerolehan: Number(asset.hargaPerolehan),
          isCip,
        },
        journalId,
        createdBy: userId || null,
      },
    });

    return {
      message: 'Aset baru berhasil didaftarkan via API V1.',
      asset,
      isExisting: false,
    };
  }

  /**
   * GET /v1/fixed-assets
   */
  async getAssets(
    tenantId: string,
    filters?: { status?: FixedAssetStatus; external_ref?: string; role?: string },
  ) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.external_ref) where.externalRef = filters.external_ref;

    const list = await this.prisma.fixedAsset.findMany({
      where,
      include: {
        category: {
          select: { kode: true, nama: true, jenis: true },
        },
        fiscalGroup: { select: { kode: true, nama: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sanitizeAssetForRole(list, filters?.role);
  }

  /**
   * GET /v1/fixed-assets/:ref (by externalRef or noAset)
   */
  async getAssetByRef(tenantId: string, ref: string, role?: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: {
        tenantId,
        OR: [{ externalRef: ref }, { noAset: ref }, { id: ref }],
      },
      include: {
        category: true,
        fiscalGroup: true,
        events: { orderBy: { tanggal: 'desc' } },
      },
    });

    if (!asset) {
      throw new NotFoundException(`Aset dengan referensi "${ref}" tidak ditemukan.`);
    }

    return sanitizeAssetForRole(asset, role);
  }

  /**
   * GET /v1/fixed-assets/:ref/schedule
   */
  async getAssetScheduleByRef(tenantId: string, ref: string, role?: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: {
        tenantId,
        OR: [{ externalRef: ref }, { noAset: ref }, { id: ref }],
      },
    });

    if (!asset) {
      throw new NotFoundException(`Aset dengan referensi "${ref}" tidak ditemukan.`);
    }

    return this.depreciationService.getAssetSchedule(tenantId, asset.id, role);
  }

  /**
   * GET /v1/fixed-assets/categories
   */
  async getCategories(tenantId: string) {
    return this.prisma.assetCategory.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        kode: true,
        nama: true,
        jenis: true,
        dapatDisusutkan: true,
        metodeKomersial: true,
        umurManfaatBulan: true,
        fiscalGroup: { select: { kode: true, nama: true } },
      },
      orderBy: { kode: 'asc' },
    });
  }

  /**
   * POST /v1/fixed-assets/:ref/capitalize
   */
  async capitalizeByRef(
    tenantId: string,
    ref: string,
    payload: { category_id: string; tanggal_mulai_digunakan: string; tanggal?: string },
    userId?: string,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: {
        tenantId,
        OR: [{ externalRef: ref }, { noAset: ref }, { id: ref }],
      },
      include: { category: { include: { akunCip: true } } },
    });
    if (!asset) {
      throw new NotFoundException(`Aset "${ref}" tidak ditemukan.`);
    }
    if (asset.status !== FixedAssetStatus.CIP) {
      throw new BadRequestException(`Aset harus berstatus CIP untuk dikapitalisasi.`);
    }

    const newCategory = await this.prisma.assetCategory.findFirst({
      where: { id: payload.category_id, tenantId },
      include: { akunAset: true },
    });
    if (!newCategory) {
      throw new BadRequestException('Kategori akhir aset tidak valid.');
    }

    const noDokumen = await this.numberingService.getNextNumber(
      tenantId,
      SubledgerDocType.ASSET_CAPITALIZATION,
    );

    const docDate = payload.tanggal || new Date().toISOString().slice(0, 10);
    const nilai = Number(asset.hargaPerolehan);

    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: docDate,
      deskripsi: `Kapitalisasi CIP V1 ${asset.noAset} (${asset.nama}) ke kategori ${newCategory.nama}`,
      sumber_aplikasi: 'API-V1-FIXED-ASSET',
      sourceDocType: 'ASSET_CAPITALIZATION',
      sourceDocId: noDokumen,
      no_voucher: noDokumen,
      mata_uang: asset.mata_uang,
      entries: [
        {
          kode_akun: newCategory.akunAset.kode_akun,
          tipe: 'DEBIT',
          jumlah: nilai,
          dimensions: asset.dimensions as any,
        },
        {
          kode_akun: asset.category.akunCip.kode_akun,
          tipe: 'KREDIT',
          jumlah: nilai,
          dimensions: asset.dimensions as any,
        },
      ],
    });

    const cap = await this.prisma.assetCapitalization.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(docDate),
        assetId: asset.id,
        categoryId: newCategory.id,
        tanggalMulaiDigunakan: new Date(payload.tanggal_mulai_digunakan),
        status: AssetCapitalizationStatus.POSTED,
        journalId: journal.id,
        createdBy: userId || null,
      },
    });

    const updated = await this.prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        status: FixedAssetStatus.AKTIF,
        categoryId: newCategory.id,
        tanggalMulaiDigunakan: new Date(payload.tanggal_mulai_digunakan),
      },
    });

    await this.prisma.assetEvent.create({
      data: {
        assetId: asset.id,
        tipe: AssetEventType.KAPITALISASI,
        tanggal: new Date(docDate),
        data: {
          sumber: 'API-V1',
          noDokumen,
          nilaiKapitalisasi: nilai,
        },
        journalId: journal.id,
        createdBy: userId || null,
      },
    });

    return {
      message: 'Kapitalisasi aset CIP via API V1 berhasil.',
      capitalization: cap,
      asset: updated,
    };
  }
}

