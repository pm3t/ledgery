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
  Prisma,
} from '@prisma/client';
import {
  CreateFixedAssetDto,
  UpdateFixedAssetDto,
  ActivateAssetDto,
  CapitalizeCipDto,
  DuplicateNAssetDto,
  ImportOpeningBalanceDto,
} from '../dto/fixed-asset.dto';
import { sanitizeAssetForRole } from '../../common/asset-serializer';
import { AssetStorageService } from './storage.service';

@Injectable()
export class FixedAssetService {
  private readonly logger = new Logger(FixedAssetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: DocumentNumberingService,
    private readonly subledgerPosting: SubledgerPostingService,
    private readonly storageService: AssetStorageService,
  ) {}

  /**
   * Menampilkan daftar kartu aset tetap dengan filter dan sanitasi keamanan peran PETUGAS_ASET.
   */
  async findAll(
    tenantId: string,
    filters?: {
      status?: FixedAssetStatus;
      categoryId?: string;
      searchQuery?: string;
      externalRef?: string;
      role?: string;
    },
  ) {
    const where: Prisma.FixedAssetWhereInput = { tenantId };

    if (filters?.status) where.status = filters.status;
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.externalRef) where.externalRef = filters.externalRef;
    if (filters?.searchQuery) {
      const q = filters.searchQuery.trim();
      where.OR = [
        { nama: { contains: q, mode: 'insensitive' } },
        { noAset: { contains: q, mode: 'insensitive' } },
        { tagCode: { contains: q, mode: 'insensitive' } },
      ];
    }

    const assets = await this.prisma.fixedAsset.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            kode: true,
            nama: true,
            jenis: true,
            akunAset: { select: { kode_akun: true, nama_akun: true } },
            akunAkumulasi: { select: { kode_akun: true, nama_akun: true } },
          },
        },
        fiscalGroup: { select: { kode: true, nama: true, tarifGarisLurus: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Sanitasi untuk peran PETUGAS_ASET
    return sanitizeAssetForRole(assets, filters?.role);
  }

  /**
   * Mengambil detail satu kartu aset.
   */
  async findOne(tenantId: string, id: string, role?: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id, tenantId },
      include: {
        category: {
          include: {
            akunAset: true,
            akunAkumulasi: true,
            akunBeban: true,
            akunCip: true,
          },
        },
        fiscalGroup: true,
        events: { orderBy: { tanggal: 'desc' } },
        attachments: { orderBy: { createdAt: 'desc' } },
        capitalizations: { orderBy: { createdAt: 'desc' } },
        depreciationEntries: { orderBy: { periode: 'asc' } },
      },
    });

    if (!asset) {
      throw new NotFoundException(`Kartu aset dengan ID "${id}" tidak ditemukan.`);
    }

    return sanitizeAssetForRole(asset, role);
  }

  /**
   * Membuat kartu aset baru (Manual / Registrasi Langsung).
   */
  async create(tenantId: string, dto: CreateFixedAssetDto, userId?: string) {
    const category = await this.prisma.assetCategory.findFirst({
      where: { id: dto.categoryId, tenantId },
      include: { akunAset: true, akunCip: true, fiscalGroup: true },
    });
    if (!category) {
      throw new BadRequestException('Kategori aset tidak valid.');
    }

    // 1. Generate noAset unik dari DocumentNumbering
    const noAset = await this.numberingService.getNextNumber(tenantId, SubledgerDocType.ASSET);

    // 2. Tentukan tagCode (default = noAset) dan validasi keunikan ketat
    const tagCode = dto.tagCode?.trim() || noAset;
    const existingTag = await this.prisma.fixedAsset.findUnique({
      where: { tenantId_tagCode: { tenantId, tagCode } },
    });
    if (existingTag) {
      throw new ConflictException(
        `Kode label / tag "${tagCode}" sudah digunakan oleh aset lain (${existingTag.noAset} - ${existingTag.nama}). Kode label tidak boleh pernah dipakai ulang.`,
      );
    }

    const kurs = dto.kurs && dto.kurs > 0 ? dto.kurs : 1;
    const hargaPerolehanFungsional = dto.hargaPerolehanAsli * kurs;
    const status = dto.isCip ? FixedAssetStatus.CIP : FixedAssetStatus.DRAFT;

    // 3. Jurnal GL opsional bila ada akunLawanId (Manual Registration dengan balancing GL)
    let journalId: string | null = null;
    if (dto.akunLawanId) {
      const akunLawan = await this.prisma.chartOfAccount.findFirst({
        where: { id: dto.akunLawanId, tenantId },
      });
      if (!akunLawan) {
        throw new BadRequestException('Akun lawan GL tidak ditemukan.');
      }

      const targetAccount = dto.isCip ? category.akunCip : category.akunAset;

      const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
        tanggal: dto.tanggalPerolehan,
        deskripsi: `Perolehan Manual Aset Tetap ${noAset} - ${dto.nama}`,
        sumber_aplikasi: 'SUBLEDGER-FIXED-ASSET',
        sourceDocType: 'ASSET_REGISTRATION',
        sourceDocId: noAset,
        no_voucher: noAset,
        mata_uang: dto.mata_uang || 'IDR',
        entries: [
          {
            kode_akun: targetAccount.kode_akun,
            tipe: 'DEBIT',
            jumlah: hargaPerolehanFungsional,
            dimensions: dto.dimensions,
          },
          {
            kode_akun: akunLawan.kode_akun,
            tipe: 'KREDIT',
            jumlah: hargaPerolehanFungsional,
          },
        ],
      });
      journalId = journal.id;
    }

    // 4. Buat kartu aset
    const asset = await this.prisma.fixedAsset.create({
      data: {
        tenantId,
        noAset,
        tagCode,
        categoryId: category.id,
        nama: dto.nama,
        deskripsi: dto.deskripsi || null,
        status,
        tanggalPerolehan: new Date(dto.tanggalPerolehan),
        tanggalMulaiDigunakan: dto.tanggalMulaiDigunakan ? new Date(dto.tanggalMulaiDigunakan) : null,
        mata_uang: dto.mata_uang || 'IDR',
        kurs,
        hargaPerolehanAsli: dto.hargaPerolehanAsli,
        hargaPerolehan: hargaPerolehanFungsional,
        nilaiResidu: dto.nilaiResidu ?? (category.nilaiResiduNominal ? Number(category.nilaiResiduNominal) : 0),
        umurManfaatBulan: dto.umurManfaatBulan || category.umurManfaatBulan,
        metodeKomersial: dto.metodeKomersial || category.metodeKomersial,
        faktorSaldoMenurun: dto.faktorSaldoMenurun || category.faktorSaldoMenurun,
        fiscalGroupId: dto.fiscalGroupId || category.fiscalGroupId,
        metodeFiskal: dto.metodeFiskal || category.metodeFiskal,
        fiskalMulaiTanggal: dto.fiskalMulaiTanggal ? new Date(dto.fiskalMulaiTanggal) : null,
        fiskalUmurOverrideBulan: dto.fiskalUmurOverrideBulan || null,
        dimensions: dto.dimensions || null,
        statusLabel: AssetLabelStatus.BELUM_DILABEL,
        sumberAplikasi: 'MANUAL',
        createdBy: userId || null,
      },
    });

    // 5. Catat AssetEvent (Timeline Audit)
    await this.prisma.assetEvent.create({
      data: {
        assetId: asset.id,
        tipe: AssetEventType.PEROLEHAN,
        tanggal: asset.tanggalPerolehan,
        data: {
          noAset: asset.noAset,
          tagCode: asset.tagCode,
          nama: asset.nama,
          hargaPerolehan: Number(asset.hargaPerolehan),
          status: asset.status,
          isCip: dto.isCip || false,
        },
        journalId,
        createdBy: userId || null,
      },
    });

    return asset;
  }

  /**
   * Memperbarui informasi aset tetap.
   */
  async update(tenantId: string, id: string, dto: UpdateFixedAssetDto, userId?: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id, tenantId },
      include: { depreciationEntries: true },
    });
    if (!asset) {
      throw new NotFoundException('Kartu aset tidak ditemukan.');
    }

    // Validasi: tagCode tidak boleh bentrok
    if (dto.tagCode && dto.tagCode !== asset.tagCode) {
      const existing = await this.prisma.fixedAsset.findUnique({
        where: { tenantId_tagCode: { tenantId, tagCode: dto.tagCode } },
      });
      if (existing) {
        throw new ConflictException(`Kode tag "${dto.tagCode}" sudah digunakan oleh aset lain.`);
      }
    }

    // Catat perubahan estimasi jika umur atau residu berubah
    const isEstimasiChanged =
      (dto.umurManfaatBulan !== undefined && dto.umurManfaatBulan !== asset.umurManfaatBulan) ||
      (dto.nilaiResidu !== undefined && dto.nilaiResidu !== Number(asset.nilaiResidu));

    const updated = await this.prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        ...(dto.nama !== undefined && { nama: dto.nama }),
        ...(dto.deskripsi !== undefined && { deskripsi: dto.deskripsi }),
        ...(dto.tagCode !== undefined && { tagCode: dto.tagCode }),
        ...(dto.tanggalMulaiDigunakan !== undefined && {
          tanggalMulaiDigunakan: dto.tanggalMulaiDigunakan ? new Date(dto.tanggalMulaiDigunakan) : null,
        }),
        ...(dto.nilaiResidu !== undefined && { nilaiResidu: dto.nilaiResidu }),
        ...(dto.umurManfaatBulan !== undefined && { umurManfaatBulan: dto.umurManfaatBulan }),
        ...(dto.metodeKomersial !== undefined && { metodeKomersial: dto.metodeKomersial }),
        ...(dto.faktorSaldoMenurun !== undefined && { faktorSaldoMenurun: dto.faktorSaldoMenurun }),
        ...(dto.fiscalGroupId !== undefined && { fiscalGroupId: dto.fiscalGroupId }),
        ...(dto.metodeFiskal !== undefined && { metodeFiskal: dto.metodeFiskal }),
        ...(dto.fiskalMulaiTanggal !== undefined && {
          fiskalMulaiTanggal: dto.fiskalMulaiTanggal ? new Date(dto.fiskalMulaiTanggal) : null,
        }),
        ...(dto.fiskalUmurOverrideBulan !== undefined && { fiskalUmurOverrideBulan: dto.fiskalUmurOverrideBulan }),
        ...(dto.dimensions !== undefined && { dimensions: dto.dimensions }),
        ...(dto.statusLabel !== undefined && { statusLabel: dto.statusLabel }),
      },
    });

    if (isEstimasiChanged) {
      await this.prisma.assetEvent.create({
        data: {
          assetId: asset.id,
          tipe: AssetEventType.PERUBAHAN_ESTIMASI,
          tanggal: new Date(),
          data: {
            sebelum: { umurManfaat: asset.umurManfaatBulan, nilaiResidu: Number(asset.nilaiResidu) },
            sesudah: { umurManfaat: updated.umurManfaatBulan, nilaiResidu: Number(updated.nilaiResidu) },
          },
          createdBy: userId || null,
        },
      });
    }

    return updated;
  }

  /**
   * Aktivasi Aset: Mengubah status dari DRAFT menjadi AKTIF.
   * Wajib mengisi tanggalMulaiDigunakan.
   */
  async activate(tenantId: string, id: string, dto: ActivateAssetDto, userId?: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id, tenantId },
      include: { category: true },
    });
    if (!asset) {
      throw new NotFoundException('Kartu aset tidak ditemukan.');
    }
    if (asset.status !== FixedAssetStatus.DRAFT) {
      throw new BadRequestException(`Hanya aset berstatus DRAFT yang dapat diaktifkan (Status saat ini: ${asset.status}).`);
    }

    const tglMulai = new Date(dto.tanggalMulaiDigunakan);

    const updated = await this.prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        status: FixedAssetStatus.AKTIF,
        tanggalMulaiDigunakan: tglMulai,
        ...(dto.umurManfaatBulan && { umurManfaatBulan: dto.umurManfaatBulan }),
        ...(dto.nilaiResidu !== undefined && { nilaiResidu: dto.nilaiResidu }),
      },
    });

    await this.prisma.assetEvent.create({
      data: {
        assetId: asset.id,
        tipe: AssetEventType.MUTASI,
        tanggal: tglMulai,
        data: {
          keterangan: 'Aktivasi Aset Tetap (DRAFT -> AKTIF)',
          tanggalMulaiDigunakan: dto.tanggalMulaiDigunakan,
        },
        createdBy: userId || null,
      },
    });

    return updated;
  }

  /**
   * Kapitalisasi CIP: Mengubah aset dalam pengerjaan (CIP) menjadi Aset Tetap AKTIF.
   * Menghasilkan dokumen AssetCapitalization dan jurnal:
   * Dr Akun Aset Tetap Kategori Baru / Cr Akun CIP Kategori Lama.
   */
  async capitalizeCip(tenantId: string, id: string, dto: CapitalizeCipDto, userId?: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id, tenantId },
      include: { category: { include: { akunCip: true } } },
    });
    if (!asset) {
      throw new NotFoundException('Kartu aset tidak ditemukan.');
    }
    if (asset.status !== FixedAssetStatus.CIP) {
      throw new BadRequestException(`Hanya aset berstatus CIP yang dapat dikapitalisasi (Status saat ini: ${asset.status}).`);
    }

    const newCategory = await this.prisma.assetCategory.findFirst({
      where: { id: dto.categoryId, tenantId },
      include: { akunAset: true, fiscalGroup: true },
    });
    if (!newCategory) {
      throw new BadRequestException('Kategori akhir aset tidak valid.');
    }

    // 1. Generate nomor dokumen kapitalisasi
    const noDokumen = await this.numberingService.getNextNumber(
      tenantId,
      SubledgerDocType.ASSET_CAPITALIZATION,
    );

    const nilaiKapitalisasi = Number(asset.hargaPerolehan);
    const tanggalDoc = new Date(dto.tanggal);
    const tanggalMulai = new Date(dto.tanggalMulaiDigunakan);

    // 2. Buat Jurnal Pemindahan Nilai: Dr Akun Aset Kategori Baru / Cr Akun CIP Kategori Lama
    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: dto.tanggal,
      deskripsi: `Kapitalisasi CIP ${asset.noAset} (${asset.nama}) ke kategori ${newCategory.nama}`,
      sumber_aplikasi: 'SUBLEDGER-FIXED-ASSET',
      sourceDocType: 'ASSET_CAPITALIZATION',
      sourceDocId: noDokumen,
      no_voucher: noDokumen,
      mata_uang: asset.mata_uang,
      entries: [
        {
          kode_akun: newCategory.akunAset.kode_akun,
          tipe: 'DEBIT',
          jumlah: nilaiKapitalisasi,
          dimensions: asset.dimensions as any,
        },
        {
          kode_akun: asset.category.akunCip.kode_akun,
          tipe: 'KREDIT',
          jumlah: nilaiKapitalisasi,
          dimensions: asset.dimensions as any,
        },
      ],
    });

    // 3. Simpan dokumen AssetCapitalization
    const capDoc = await this.prisma.assetCapitalization.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: tanggalDoc,
        assetId: asset.id,
        categoryId: newCategory.id,
        tanggalMulaiDigunakan: tanggalMulai,
        status: AssetCapitalizationStatus.POSTED,
        journalId: journal.id,
        createdBy: userId || null,
      },
    });

    // 4. Update status dan kategori kartu aset menjadi AKTIF
    const updatedAsset = await this.prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        status: FixedAssetStatus.AKTIF,
        categoryId: newCategory.id,
        tanggalMulaiDigunakan: tanggalMulai,
        umurManfaatBulan: newCategory.umurManfaatBulan,
        metodeKomersial: newCategory.metodeKomersial,
        metodeFiskal: newCategory.metodeFiskal,
        fiscalGroupId: newCategory.fiscalGroupId,
      },
    });

    // 5. Catat AssetEvent (KAPITALISASI)
    await this.prisma.assetEvent.create({
      data: {
        assetId: asset.id,
        tipe: AssetEventType.KAPITALISASI,
        tanggal: tanggalDoc,
        data: {
          noDokumen,
          kategoriLama: asset.category.nama,
          kategoriBaru: newCategory.nama,
          nilaiKapitalisasi,
          tanggalMulaiDigunakan: dto.tanggalMulaiDigunakan,
        },
        journalId: journal.id,
        createdBy: userId || null,
      },
    });

    return {
      message: 'Kapitalisasi aset CIP berhasil diselesaikan.',
      capitalization: capDoc,
      asset: updatedAsset,
    };
  }

  /**
   * Duplikasi Kartu Aset menjadi N unit tambahan.
   * Menyalin atribut lengkap, menghasilkan nomor aset dan tagCode unik per unit.
   */
  async duplicateN(tenantId: string, id: string, dto: DuplicateNAssetDto, userId?: string) {
    const source = await this.prisma.fixedAsset.findFirst({
      where: { id, tenantId },
    });
    if (!source) {
      throw new NotFoundException('Kartu aset sumber tidak ditemukan.');
    }

    const createdAssets: any[] = [];

    for (let i = 0; i < dto.n; i++) {
      const noAset = await this.numberingService.getNextNumber(tenantId, SubledgerDocType.ASSET);
      const tagCode = noAset; // Kode tag baru otomatis mengikuti nomor aset baru

      const newAsset = await this.prisma.fixedAsset.create({
        data: {
          tenantId,
          noAset,
          tagCode,
          categoryId: source.categoryId,
          nama: `${source.nama} (Unit ${i + 2})`,
          deskripsi: source.deskripsi,
          status: source.status,
          tanggalPerolehan: source.tanggalPerolehan,
          tanggalMulaiDigunakan: source.tanggalMulaiDigunakan,
          mata_uang: source.mata_uang,
          kurs: source.kurs,
          hargaPerolehanAsli: source.hargaPerolehanAsli,
          hargaPerolehan: source.hargaPerolehan,
          nilaiResidu: source.nilaiResidu,
          umurManfaatBulan: source.umurManfaatBulan,
          metodeKomersial: source.metodeKomersial,
          faktorSaldoMenurun: source.faktorSaldoMenurun,
          fiscalGroupId: source.fiscalGroupId,
          metodeFiskal: source.metodeFiskal,
          fiskalMulaiTanggal: source.fiskalMulaiTanggal,
          fiskalUmurOverrideBulan: source.fiskalUmurOverrideBulan,
          dimensions: source.dimensions ? JSON.parse(JSON.stringify(source.dimensions)) : null,
          statusLabel: AssetLabelStatus.BELUM_DILABEL,
          sumberAplikasi: 'DUPLIKASI',
          createdBy: userId || null,
        },
      });

      await this.prisma.assetEvent.create({
        data: {
          assetId: newAsset.id,
          tipe: AssetEventType.PEROLEHAN,
          tanggal: newAsset.tanggalPerolehan,
          data: {
            sumberDuplikasi: source.noAset,
            unitIndex: i + 2,
          },
          createdBy: userId || null,
        },
      });

      createdAssets.push(newAsset);
    }

    return {
      message: `Berhasil menduplikasi ${dto.n} unit aset baru.`,
      assets: createdAssets,
    };
  }

  /**
   * Impor Saldo Awal Aset Tetap (Opening Balance Import).
   * ATURAN UTAMA:
   * 1. TIDAK MEMBUAT JURNAL GL BARU.
   * 2. Simpan kartu aset berstatus AKTIF.
   * 3. Simpan akumulasi penyusutan sebagai AssetDepreciationEntry dengan flag isOpening = true.
   * 4. Membandingkan total perolehan & akumulasi per kategori vs saldo GL saat ini.
   */
  async importOpeningBalance(tenantId: string, dto: ImportOpeningBalanceDto, userId?: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Daftar aset untuk saldo awal tidak boleh kosong.');
    }

    const categories = await this.prisma.assetCategory.findMany({
      where: { tenantId },
      include: { fiscalGroup: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.kode, c]));

    const importedAssets: any[] = [];
    const errors: string[] = [];

    // Perhitungan ringkasan per kategori untuk rekonsiliasi GL
    const categoryTotals = new Map<
      string,
      { totalHargaPerolehan: number; totalAkumulasiKomersial: number; count: number }
    >();

    for (const [idx, item] of dto.items.entries()) {
      const cat = categoryMap.get(item.kategoriKode);
      if (!cat) {
        errors.push(`Baris ${idx + 1}: Kategori "${item.kategoriKode}" tidak terdaftar di master kategori.`);
        continue;
      }

      const tagCode = item.tagCode?.trim() || item.noAset;

      // Cek keunikan noAset atau tagCode
      const exists = await this.prisma.fixedAsset.findFirst({
        where: {
          tenantId,
          OR: [{ noAset: item.noAset }, { tagCode }],
        },
      });
      if (exists) {
        errors.push(`Baris ${idx + 1}: Nomor aset "${item.noAset}" atau Tag "${tagCode}" sudah terdaftar.`);
        continue;
      }

      const tglPerolehan = new Date(item.tanggalPerolehan);
      const tglMulai = item.tanggalMulaiDigunakan ? new Date(item.tanggalMulaiDigunakan) : tglPerolehan;

      const asset = await this.prisma.fixedAsset.create({
        data: {
          tenantId,
          noAset: item.noAset,
          tagCode,
          categoryId: cat.id,
          nama: item.nama,
          status: FixedAssetStatus.AKTIF,
          tanggalPerolehan: tglPerolehan,
          tanggalMulaiDigunakan: tglMulai,
          mata_uang: 'IDR',
          kurs: 1.0,
          hargaPerolehanAsli: item.hargaPerolehan,
          hargaPerolehan: item.hargaPerolehan,
          nilaiResidu: 0,
          umurManfaatBulan: item.sisaUmurBulan || cat.umurManfaatBulan,
          metodeKomersial: cat.metodeKomersial,
          faktorSaldoMenurun: cat.faktorSaldoMenurun,
          fiscalGroupId: cat.fiscalGroupId,
          metodeFiskal: cat.metodeFiskal,
          dimensions: item.dimensions || null,
          statusLabel: AssetLabelStatus.BELUM_DILABEL,
          sumberAplikasi: 'OPENING_BALANCE',
          createdBy: userId || null,
        },
      });

      // Simpan saldo awal akumulasi penyusutan sebagai AssetDepreciationEntry
      const periodeAwal = tglMulai.toISOString().slice(0, 7);
      const akumKomersial = item.akumulasiPenyusutanKomersial || 0;
      const akumFiskal = item.akumulasiPenyusutanFiskal || 0;
      const nilaiBukuKomersial = Math.max(0, item.hargaPerolehan - akumKomersial);
      const nilaiBukuFiskal = Math.max(0, item.hargaPerolehan - akumFiskal);

      await this.prisma.assetDepreciationEntry.create({
        data: {
          tenantId,
          assetId: asset.id,
          periode: periodeAwal,
          tanggal: tglMulai,
          jumlahKomersial: akumKomersial,
          jumlahFiskal: akumFiskal,
          akumulasiKomersial: akumKomersial,
          akumulasiFiskal: akumFiskal,
          nilaiBukuKomersial,
          nilaiBukuFiskal,
          isOpening: true,
        },
      });

      await this.prisma.assetEvent.create({
        data: {
          assetId: asset.id,
          tipe: AssetEventType.PEROLEHAN,
          tanggal: tglPerolehan,
          data: {
            sumber: 'SALDO_AWAL_ASET',
            hargaPerolehan: item.hargaPerolehan,
            akumulasiKomersial: akumKomersial,
          },
          createdBy: userId || null,
        },
      });

      // Akumulasikan ke ringkasan per kategori
      const currentTot = categoryTotals.get(cat.id) || {
        totalHargaPerolehan: 0,
        totalAkumulasiKomersial: 0,
        count: 0,
      };
      currentTot.totalHargaPerolehan += item.hargaPerolehan;
      currentTot.totalAkumulasiKomersial += akumKomersial;
      currentTot.count += 1;
      categoryTotals.set(cat.id, currentTot);

      importedAssets.push(asset);
    }

    if (errors.length > 0 && importedAssets.length === 0) {
      throw new BadRequestException({
        message: 'Gagal mengimpor saldo awal aset tetap.',
        errors,
      });
    }

    // 5. Validasi dan Rekonsiliasi terhadap Saldo GL
    const reconResults: any[] = [];
    for (const [catId, tot] of categoryTotals.entries()) {
      const cat = categories.find((c) => c.id === catId)!;

      // Ambil saldo GL akun aset (Normal Debit)
      const debitAsset = await this.prisma.journalEntry.aggregate({
        where: {
          chartOfAccountId: cat.akunAsetId,
          tipe: 'DEBIT',
          journal: { tenantId, status: 'POSTED' },
        },
        _sum: { jumlah: true },
      });
      const creditAsset = await this.prisma.journalEntry.aggregate({
        where: {
          chartOfAccountId: cat.akunAsetId,
          tipe: 'KREDIT',
          journal: { tenantId, status: 'POSTED' },
        },
        _sum: { jumlah: true },
      });
      const glAssetBalance = Number(debitAsset._sum.jumlah || 0) - Number(creditAsset._sum.jumlah || 0);

      // Ambil saldo GL akun akumulasi (Normal Kredit)
      const debitAkum = await this.prisma.journalEntry.aggregate({
        where: {
          chartOfAccountId: cat.akunAkumulasiId,
          tipe: 'DEBIT',
          journal: { tenantId, status: 'POSTED' },
        },
        _sum: { jumlah: true },
      });
      const creditAkum = await this.prisma.journalEntry.aggregate({
        where: {
          chartOfAccountId: cat.akunAkumulasiId,
          tipe: 'KREDIT',
          journal: { tenantId, status: 'POSTED' },
        },
        _sum: { jumlah: true },
      });
      const glAkumBalance = Number(creditAkum._sum.jumlah || 0) - Number(debitAkum._sum.jumlah || 0);

      const selisihAsset = tot.totalHargaPerolehan - glAssetBalance;
      const selisihAkum = tot.totalAkumulasiKomersial - glAkumBalance;

      reconResults.push({
        kategoriKode: cat.kode,
        kategoriNama: cat.nama,
        jumlahUnit: tot.count,
        subledgerPerolehan: tot.totalHargaPerolehan,
        glPerolehan: glAssetBalance,
        selisihPerolehan: selisihAsset,
        subledgerAkumulasi: tot.totalAkumulasiKomersial,
        glAkumulasi: glAkumBalance,
        selisihAkumulasi: selisihAkum,
        status:
          Math.abs(selisihAsset) < 0.01 && Math.abs(selisihAkum) < 0.01
            ? 'COCOK'
            : 'BELUM_REKONSILIASI',
      });
    }

    return {
      message: `Berhasil mengimpor ${importedAssets.length} kartu aset tetap.`,
      importedCount: importedAssets.length,
      errors,
      reconciliation: reconResults,
    };
  }

  /**
   * Upload lampiran bukti aset.
   */
  async uploadAttachment(
    tenantId: string,
    assetId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    userId?: string,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
    });
    if (!asset) {
      throw new NotFoundException('Kartu aset tidak ditemukan.');
    }

    const saved = await this.storageService.saveFile(fileBuffer, originalName, mimeType);

    return this.prisma.assetAttachment.create({
      data: {
        assetId: asset.id,
        namaFile: saved.namaFile,
        tipe: saved.tipe,
        ukuran: saved.ukuran,
        storageKey: saved.storageKey,
        uploadedBy: userId || null,
      },
    });
  }

  /**
   * Mengambil linimasa (events) aset.
   */
  async getTimeline(tenantId: string, assetId: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
    });
    if (!asset) {
      throw new NotFoundException('Kartu aset tidak ditemukan.');
    }

    return this.prisma.assetEvent.findMany({
      where: { assetId: asset.id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
