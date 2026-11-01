import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DocumentNumberingService,
  SubledgerDocType,
} from '../../subledger/document-numbering.service';
import { SubledgerPostingService } from '../../subledger/subledger-posting.service';
import { JournalService } from '../../journal/journal.service';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import {
  DepreciationEngineService,
  EngineAssetInput,
} from './depreciation-engine.service';
import { AssetDepreciationService } from './asset-depreciation.service';
import {
  FixedAssetStatus,
  AssetEventType,
  AssetTransferStatus,
  ImpairmentAccumulationMode,
  AssetImpairmentStatus,
  AssetDisposalType,
  AssetDisposalStatus,
  DepreciationBook,
  DepreciationEntryStatus,
  PeriodStatus,
  DepreciationConvention,
} from '@prisma/client';
import {
  TransferAssetDto,
  MassTransferDto,
  ImpairAssetDto,
  DisposeAssetDto,
} from '../dto/fixed-asset.dto';

@Injectable()
export class AssetLifecycleService {
  private readonly logger = new Logger(AssetLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: DocumentNumberingService,
    private readonly subledgerPosting: SubledgerPostingService,
    private readonly journalService: JournalService,
    private readonly periodService: AccountingPeriodService,
    private readonly engine: DepreciationEngineService,
    private readonly depreciationService: AssetDepreciationService,
  ) {}

  /**
   * Helper pembulatan 2 desimal standar akuntansi
   */
  private round2(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  // =========================================================================
  // 1. MUTASI / TRANSFER LOKASI & DIMENSI ANALITIK ASET
  // =========================================================================

  /**
   * Mengubah Dimensi Analitik (Cost Center, Departemen, Proyek, dsb) aset.
   * - Mencatat AssetTransfer dan AssetDimensionHistory
   * - TIDAK menghasilkan jurnal GL
   * - Menentukan alokasi dimensi beban penyusutan untuk periode-periode berikutnya
   */
  async transferAsset(
    tenantId: string,
    assetId: string,
    dto: TransferAssetDto,
    userId: string,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
    });

    if (!asset) {
      throw new NotFoundException('Kartu aset tetap tidak ditemukan.');
    }

    if (
      asset.status !== FixedAssetStatus.AKTIF &&
      asset.status !== FixedAssetStatus.DISUSUTKAN_PENUH
    ) {
      throw new BadRequestException(
        `Mutasi hanya dapat dilakukan pada aset yang berstatus AKTIF atau DISUSUTKAN_PENUH (Status saat ini: ${asset.status}).`,
      );
    }

    const tgl = new Date(dto.tanggal);
    await this.periodService.validateJournalDate(tenantId, tgl);

    const noDokumen = await this.numberingService.getNextNumber(
      tenantId,
      SubledgerDocType.ASSET_TRANSFER,
    );

    const dariDimensions = asset.dimensions || {};
    const keDimensions = dto.ke || {};

    const transfer = await this.prisma.$transaction(async (tx) => {
      // 1. Catat dokumen AssetTransfer
      const tr = await tx.assetTransfer.create({
        data: {
          tenantId,
          noDokumen,
          assetId: asset.id,
          tanggal: tgl,
          dari: dariDimensions,
          ke: keDimensions,
          alasan: dto.alasan,
          status: AssetTransferStatus.POSTED,
          createdBy: userId,
        },
      });

      // 2. Catat riwayat dimensi untuk digunakan oleh DepreciationEngine
      await tx.assetDimensionHistory.create({
        data: {
          assetId: asset.id,
          berlakuMulai: tgl,
          dimensions: keDimensions,
          alasan: dto.alasan,
          createdBy: userId,
        },
      });

      // 3. Update dimensi aktif pada kartu aset
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          dimensions: keDimensions,
        },
      });

      // 4. Catat Audit Trail AssetEvent
      await tx.assetEvent.create({
        data: {
          assetId: asset.id,
          tipe: AssetEventType.MUTASI,
          tanggal: tgl,
          data: {
            noDokumen,
            dari: dariDimensions,
            ke: keDimensions,
            alasan: dto.alasan,
          },
          createdBy: userId,
        },
      });

      return tr;
    });

    this.logger.log(`Mutasi aset ${asset.noAset} (${noDokumen}) berhasil diproses.`);
    return transfer;
  }

  /**
   * Mutasi massal lintas aset (digunakan dari hasil audit opname / verifikasi fisik)
   */
  async massTransfer(tenantId: string, dto: MassTransferDto, userId: string) {
    const results: any[] = [];
    const errors: any[] = [];

    for (const item of dto.items) {
      try {
        const tr = await this.transferAsset(
          tenantId,
          item.assetId,
          {
            tanggal: dto.tanggal,
            ke: item.ke,
            alasan: item.alasan || dto.alasanDefault || 'Mutasi massal hasil verifikasi inventaris fisik',
          },
          userId,
        );
        results.push(tr);
      } catch (err: any) {
        errors.push({
          assetId: item.assetId,
          message: err.message,
        });
      }
    }

    return {
      success: true,
      totalSuccess: results.length,
      totalErrors: errors.length,
      results,
      errors,
    };
  }

  // =========================================================================
  // 2. PENURUNAN NILAI (IMPAIRMENT)
  // =========================================================================

  /**
   * Mencatat penurunan nilai aset (Impairment)
   * - Dr Rugi Penurunan Nilai / Cr Akumulasi (Penyusutan atau Penurunan Nilai)
   * - Nilai tercatat turun, penyusutan komersial berikutnya dihitung ulang prospektif
   * - Buku fiskal TIDAK terpengaruh
   */
  async impairAsset(
    tenantId: string,
    assetId: string,
    dto: ImpairAssetDto,
    userId: string,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
      include: {
        category: {
          include: {
            akunAset: true,
            akunAkumulasi: true,
            akunRugiPenurunanNilai: true,
            akunAkumulasiPenurunanNilai: true,
          },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Kartu aset tetap tidak ditemukan.');
    }

    if (asset.status !== FixedAssetStatus.AKTIF) {
      throw new BadRequestException(
        `Penurunan nilai hanya dapat dilakukan pada aset berstatus AKTIF (Status saat ini: ${asset.status}).`,
      );
    }

    const tgl = new Date(dto.tanggal);
    await this.periodService.validateJournalDate(tenantId, tgl);

    const nilaiTercatatSaatIni = Number(asset.nilaiTercatat);
    const nilaiResidu = Number(asset.nilaiResidu || 0);
    const batasMaksimalPenurunan = Math.max(0, this.round2(nilaiTercatatSaatIni - nilaiResidu));

    if (dto.jumlah <= 0) {
      throw new BadRequestException('Nominal penurunan nilai harus lebih besar dari 0.');
    }

    if (dto.jumlah > batasMaksimalPenurunan) {
      throw new BadRequestException(
        `Nominal penurunan nilai (Rp ${dto.jumlah.toLocaleString('id-ID')}) melebihi nilai tercatat di atas residu (Rp ${batasMaksimalPenurunan.toLocaleString('id-ID')}).`,
      );
    }

    const modeAkumulasi =
      dto.modeAkumulasi ||
      (asset.category.akunAkumulasiPenurunanNilaiId
        ? ImpairmentAccumulationMode.AKUMULASI_PENURUNAN_NILAI
        : ImpairmentAccumulationMode.AKUMULASI_PENYUSUTAN);

    // Tentukan akun kredit akumulasi
    let akunKredit = asset.category.akunAkumulasi;
    if (
      modeAkumulasi === ImpairmentAccumulationMode.AKUMULASI_PENURUNAN_NILAI &&
      asset.category.akunAkumulasiPenurunanNilai
    ) {
      akunKredit = asset.category.akunAkumulasiPenurunanNilai;
    }

    const noDokumen = await this.numberingService.getNextNumber(
      tenantId,
      SubledgerDocType.ASSET_IMPAIRMENT,
    );

    // Buat Jurnal GL: Dr Rugi Penurunan Nilai / Cr Akumulasi
    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: dto.tanggal,
      deskripsi: `Penurunan Nilai (Impairment) Aset ${asset.noAset} (${asset.nama}) - ${dto.alasan}`,
      sumber_aplikasi: 'SUBLEDGER-FIXED-ASSET',
      sourceDocType: 'ASSET_IMPAIRMENT',
      sourceDocId: noDokumen,
      no_voucher: noDokumen,
      mata_uang: asset.mata_uang,
      entries: [
        {
          kode_akun: asset.category.akunRugiPenurunanNilai.kode_akun,
          tipe: 'DEBIT',
          jumlah: dto.jumlah,
          dimensions: asset.dimensions as any,
        },
        {
          kode_akun: akunKredit.kode_akun,
          tipe: 'KREDIT',
          jumlah: dto.jumlah,
          dimensions: asset.dimensions as any,
        },
      ],
    });

    const impairment = await this.prisma.$transaction(async (tx) => {
      const imp = await tx.assetImpairment.create({
        data: {
          tenantId,
          noDokumen,
          assetId: asset.id,
          tanggal: tgl,
          jumlah: dto.jumlah,
          alasan: dto.alasan,
          modeAkumulasi,
          status: AssetImpairmentStatus.POSTED,
          journalId: journal.id,
          createdBy: userId,
        },
      });

      const newNilaiTercatat = this.round2(nilaiTercatatSaatIni - dto.jumlah);
      const newAkumulasiKomersial = this.round2(Number(asset.akumulasiKomersial) + dto.jumlah);

      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          nilaiTercatat: newNilaiTercatat,
          akumulasiKomersial: newAkumulasiKomersial,
          // Sisa buku fiskal TIDAK disentuh
        },
      });

      await tx.assetEvent.create({
        data: {
          assetId: asset.id,
          tipe: AssetEventType.PENURUNAN_NILAI,
          tanggal: tgl,
          data: {
            noDokumen,
            jumlah: dto.jumlah,
            alasan: dto.alasan,
            modeAkumulasi,
            nilaiTercatatSebelum: nilaiTercatatSaatIni,
            nilaiTercatatBaru: newNilaiTercatat,
          },
          createdBy: userId,
        },
      });

      return imp;
    });

    return impairment;
  }

  // =========================================================================
  // 3. PELEPASAN & PENGHAPUSAN ASET (DISPOSAL / WRITE-OFF)
  // =========================================================================

  /**
   * Helper internal: Memposting penyusutan komersial tertinggal sampai tanggal pelepasan
   */
  public async postCatchUpDepreciationBeforeDisposal(
    tenantId: string,
    asset: any,
    disposalDate: Date,
    userId: string,
  ): Promise<number> {
    const setting = await this.prisma.subledgerSetting.findUnique({ where: { tenantId } });
    const convention = setting?.depreciationConvention || DepreciationConvention.BULAN_PENUH;

    const disposalYear = disposalDate.getFullYear();
    let disposalMonth = disposalDate.getMonth() + 1; // 1 - 12

    // Konvensi: Bulan Penuh = bulan pelepasan masih disusutkan; Bulan Berikutnya = bulan pelepasan tidak disusutkan
    if (convention === DepreciationConvention.BULAN_BERIKUTNYA) {
      disposalMonth -= 1;
      if (disposalMonth === 0) {
        disposalMonth = 12;
      }
    }

    // Ambil seluruh entri aktif komersial yang sudah pernah diposting
    const existingEntries = await this.prisma.assetDepreciationEntry.findMany({
      where: {
        assetId: asset.id,
        buku: DepreciationBook.KOMERSIAL,
        status: DepreciationEntryStatus.AKTIF,
      },
    });
    const postedMonths = new Set(existingEntries.map((e) => `${e.periodeBukuTahun}-${e.periodeBukuBulan}`));

    // Generate jadwal komersial murni
    const engineAsset: EngineAssetInput = {
      id: asset.id,
      hargaPerolehan: Number(asset.hargaPerolehan),
      nilaiResidu: Number(asset.nilaiResidu || 0),
      umurManfaatBulan: asset.umurManfaatBulan,
      metodeKomersial: asset.metodeKomersial,
      faktorSaldoMenurun: Number(asset.faktorSaldoMenurun || 2),
      tanggalPerolehan: asset.tanggalPerolehan,
      tanggalMulaiDigunakan: asset.tanggalMulaiDigunakan,
      dapatDisusutkan: asset.category.dapatDisusutkan,
      fiscalGroupId: asset.fiscalGroupId,
      metodeFiskal: asset.metodeFiskal,
      aturanMulaiFiskal: asset.category.aturanMulaiFiskal,
      fiskalMulaiTanggal: asset.fiskalMulaiTanggal,
      fiskalUmurOverrideBulan: asset.fiskalUmurOverrideBulan,
    };

    const schedule = this.engine.calculateCommercialSchedule(
      engineAsset,
      convention,
      (asset.estimateChanges || []).map((ec: any) => ({
        berlakuMulaiPeriode: ec.berlakuMulaiPeriode,
        umurBaruBulan: ec.umurBaruBulan,
        sisaUmurBulan: ec.sisaUmurBulan,
        residuBaru: ec.residuBaru ? Number(ec.residuBaru) : null,
        metodeBaru: ec.metodeBaru,
      })),
      (asset.costAdditions || []).map((ca: any) => ({
        tanggal: ca.tanggal,
        jumlah: Number(ca.jumlah),
      })),
      (asset.impairments || []).map((im: any) => ({
        tanggal: im.tanggal,
        jumlah: Number(im.jumlah),
      })),
    );

    // Cari bulan-bulan yang belum disusutkan sampai batas pelepasan
    const unpostedItems = schedule.filter((item) => {
      const isUpToDisposal =
        item.tahun < disposalYear ||
        (item.tahun === disposalYear && item.bulan <= disposalMonth);
      const isAlreadyPosted = postedMonths.has(`${item.tahun}-${item.bulan}`);
      return isUpToDisposal && !isAlreadyPosted;
    });

    if (unpostedItems.length === 0) {
      return 0;
    }

    const totalCatchUpBeban = this.round2(unpostedItems.reduce((sum, it) => sum + it.beban, 0));

    // Ambil periode terbuka tempat pelepasan berlangsung
    const openPeriod = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { tenantId },
        status: PeriodStatus.OPEN,
        tanggal_mulai: { lte: disposalDate },
        tanggal_selesai: { gte: disposalDate },
      },
    });

    if (!openPeriod) {
      throw new BadRequestException(
        `Tanggal pelepasan aset (${disposalDate.toISOString().slice(0, 10)}) harus berada di dalam periode akuntansi yang berstatus OPEN.`,
      );
    }

    // Buat jurnal GL penyusutan tertinggal: Dr Beban Penyusutan / Cr Akumulasi Penyusutan
    const catchUpJournal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: disposalDate.toISOString().slice(0, 10),
      deskripsi: `Penyusutan Tertinggal Sebelum Pelepasan Aset ${asset.noAset} (${unpostedItems.length} bulan)`,
      sumber_aplikasi: 'SUBLEDGER-FIXED-ASSET',
      sourceDocType: 'ASSET_DEPRECIATION_CATCHUP',
      sourceDocId: asset.noAset,
      no_voucher: `DEPR-CATCHUP-${asset.noAset}`,
      mata_uang: asset.mata_uang,
      entries: [
        {
          kode_akun: asset.category.akunBeban.kode_akun,
          tipe: 'DEBIT',
          jumlah: totalCatchUpBeban,
          dimensions: asset.dimensions as any,
        },
        {
          kode_akun: asset.category.akunAkumulasi.kode_akun,
          tipe: 'KREDIT',
          jumlah: totalCatchUpBeban,
          dimensions: asset.dimensions as any,
        },
      ],
    });

    // Simpan entri-entri penyusutan
    for (const item of unpostedItems) {
      const isCatchUp =
        item.tahun < disposalYear ||
        (item.tahun === disposalYear && item.bulan < disposalMonth);

      await this.prisma.assetDepreciationEntry.create({
        data: {
          tenantId,
          assetId: asset.id,
          buku: DepreciationBook.KOMERSIAL,
          periodeBukuTahun: item.tahun,
          periodeBukuBulan: item.bulan,
          periodeBebanId: openPeriod.id,
          jumlah: item.beban,
          akumulasiSetelah: item.akumulasi,
          nilaiTercatatSetelah: item.nilaiTercatat,
          isCatchUp,
          status: DepreciationEntryStatus.AKTIF,
          periode: item.periodeStr,
          tanggal: disposalDate,
          jumlahKomersial: item.beban,
          akumulasiKomersial: item.akumulasi,
          nilaiBukuKomersial: item.nilaiTercatat,
          journalId: catchUpJournal.id,
        },
      });
    }

    return totalCatchUpBeban;
  }

  /**
   * Menjalankan Pelepasan Aset Mandiri (Tipe: JUAL_TUNAI atau HAPUS)
   */
  async disposeAsset(
    tenantId: string,
    assetId: string,
    dto: DisposeAssetDto,
    userId: string,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
      include: {
        category: {
          include: {
            akunAset: true,
            akunAkumulasi: true,
            akunBeban: true,
            akunLabaRugiPelepasan: true,
            akunRugiPenghapusan: true,
          },
        },
        fiscalGroup: true,
        estimateChanges: { orderBy: { createdAt: 'asc' } },
        costAdditions: { where: { status: 'POSTED' }, orderBy: { tanggal: 'asc' } },
        impairments: { where: { status: 'POSTED' }, orderBy: { tanggal: 'asc' } },
      },
    });

    if (!asset) {
      throw new NotFoundException('Kartu aset tetap tidak ditemukan.');
    }

    if (
      asset.status === FixedAssetStatus.DIJUAL ||
      asset.status === FixedAssetStatus.DIHAPUSKAN
    ) {
      throw new BadRequestException(
        `Aset sudah pernah dilepas atau dihapuskan (Pelepasan ganda ditolak). Status saat ini: ${asset.status}.`,
      );
    }

    const tgl = new Date(dto.tanggal);
    await this.periodService.validateJournalDate(tenantId, tgl);

    // Langkah a: Posting penyusutan tertinggal sampai tanggal pelepasan
    const catchUpAmount = await this.postCatchUpDepreciationBeforeDisposal(
      tenantId,
      asset,
      tgl,
      userId,
    );

    // Perbarui akumulasi dan nilai tercatat aset
    const hargaPerolehan = Number(asset.hargaPerolehan);
    const akumulasiTotal = this.round2(Number(asset.akumulasiKomersial) + catchUpAmount);
    const nilaiTercatatSaatPelepasan = Math.max(0, this.round2(hargaPerolehan - akumulasiTotal));

    const hargaJual = dto.tipe === AssetDisposalType.HAPUS ? 0 : Number(dto.hargaJual || 0);
    const labaRugi = this.round2(hargaJual - nilaiTercatatSaatPelepasan);

    // Buku Fiskal (PMK 72/2023)
    const fiskalSisaBuku = Number(asset.nilaiSisaBukuFiskal);
    const fiskalLabaRugi = this.round2(hargaJual - fiskalSisaBuku);

    const noDokumen = await this.numberingService.getNextNumber(
      tenantId,
      SubledgerDocType.ASSET_DISPOSAL,
    );

    // Susun jurnal GL
    const entries: any[] = [];

    if (dto.tipe === AssetDisposalType.JUAL_TUNAI) {
      if (!dto.cashBankAccountId) {
        throw new BadRequestException('Rekening Kas/Bank wajib dipilih untuk penjualan tunai.');
      }
      const cashAcc = await this.prisma.cashBankAccount.findFirst({
        where: { id: dto.cashBankAccountId, tenantId },
        include: { chartOfAccount: true },
      });
      if (!cashAcc) {
        throw new BadRequestException('Rekening kas/bank tidak ditemukan.');
      }

      // Dr Kas/Bank = harga jual
      entries.push({
        kode_akun: cashAcc.chartOfAccount.kode_akun,
        tipe: 'DEBIT',
        jumlah: hargaJual,
        dimensions: asset.dimensions as any,
      });

      // Dr Akumulasi Penyusutan = akumulasi komersial
      if (akumulasiTotal > 0) {
        entries.push({
          kode_akun: asset.category.akunAkumulasi.kode_akun,
          tipe: 'DEBIT',
          jumlah: akumulasiTotal,
          dimensions: asset.dimensions as any,
        });
      }

      // Dr/Cr Laba Rugi Pelepasan
      if (labaRugi > 0) {
        // Cr Laba Pelepasan
        entries.push({
          kode_akun: asset.category.akunLabaRugiPelepasan.kode_akun,
          tipe: 'KREDIT',
          jumlah: labaRugi,
          dimensions: asset.dimensions as any,
        });
      } else if (labaRugi < 0) {
        // Dr Rugi Pelepasan
        entries.push({
          kode_akun: asset.category.akunLabaRugiPelepasan.kode_akun,
          tipe: 'DEBIT',
          jumlah: Math.abs(labaRugi),
          dimensions: asset.dimensions as any,
        });
      }

      // Cr Akun Aset Tetap = harga perolehan
      entries.push({
        kode_akun: asset.category.akunAset.kode_akun,
        tipe: 'KREDIT',
        jumlah: hargaPerolehan,
        dimensions: asset.dimensions as any,
      });
    } else if (dto.tipe === AssetDisposalType.HAPUS) {
      // Dr Akumulasi Penyusutan
      if (akumulasiTotal > 0) {
        entries.push({
          kode_akun: asset.category.akunAkumulasi.kode_akun,
          tipe: 'DEBIT',
          jumlah: akumulasiTotal,
          dimensions: asset.dimensions as any,
        });
      }

      // Dr Rugi Penghapusan Aset = sisa nilai buku
      if (nilaiTercatatSaatPelepasan > 0) {
        entries.push({
          kode_akun: asset.category.akunRugiPenghapusan.kode_akun,
          tipe: 'DEBIT',
          jumlah: nilaiTercatatSaatPelepasan,
          dimensions: asset.dimensions as any,
        });
      }

      // Cr Akun Aset Tetap = harga perolehan
      entries.push({
        kode_akun: asset.category.akunAset.kode_akun,
        tipe: 'KREDIT',
        jumlah: hargaPerolehan,
        dimensions: asset.dimensions as any,
      });
    }

    // Posting Jurnal GL
    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: dto.tanggal,
      deskripsi: `Pelepasan Aset ${asset.noAset} (${asset.nama}) - Tipe ${dto.tipe} - ${dto.alasan}`,
      sumber_aplikasi: 'SUBLEDGER-FIXED-ASSET',
      sourceDocType: 'ASSET_DISPOSAL',
      sourceDocId: noDokumen,
      no_voucher: noDokumen,
      mata_uang: asset.mata_uang,
      entries,
    });

    // Jika JUAL_TUNAI: catat CashBankEntry buku kas
    if (dto.tipe === AssetDisposalType.JUAL_TUNAI && dto.cashBankAccountId) {
      await this.prisma.cashBankEntry.create({
        data: {
          tenantId,
          cashBankAccountId: dto.cashBankAccountId,
          tanggal: tgl,
          arah: 'MASUK',
          jumlah: hargaJual,
          jumlahFungsional: hargaJual,
          sourceType: 'CUSTOMER_RECEIPT',
          sourceDocId: noDokumen,
          keterangan: `Penjualan Tunai Aset ${asset.noAset} - ${asset.nama}`,
          journalId: journal.id,
        },
      });
    }

    // Transaksi database pelepasan
    const disposal = await this.prisma.$transaction(async (tx) => {
      const disp = await tx.assetDisposal.create({
        data: {
          tenantId,
          noDokumen,
          assetId: asset.id,
          tanggal: tgl,
          tipe: dto.tipe,
          alasan: dto.alasan,
          hargaJual: dto.tipe === AssetDisposalType.HAPUS ? null : hargaJual,
          cashBankAccountId: dto.cashBankAccountId || null,
          nilaiTercatatSaatPelepasan,
          labaRugi,
          fiskalSisaBuku,
          fiskalLabaRugi,
          status: AssetDisposalStatus.POSTED,
          journalId: journal.id,
          createdBy: userId,
        },
      });

      const newStatus =
        dto.tipe === AssetDisposalType.HAPUS
          ? FixedAssetStatus.DIHAPUSKAN
          : FixedAssetStatus.DIJUAL;

      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          status: newStatus,
          akumulasiKomersial: akumulasiTotal,
          nilaiTercatat: 0,
          nilaiSisaBukuFiskal: 0,
        },
      });

      await tx.assetEvent.create({
        data: {
          assetId: asset.id,
          tipe:
            dto.tipe === AssetDisposalType.HAPUS
              ? AssetEventType.PENGHAPUSAN
              : AssetEventType.PELEPASAN,
          tanggal: tgl,
          data: {
            noDokumen,
            tipe: dto.tipe,
            hargaJual,
            nilaiTercatatSaatPelepasan,
            labaRugi,
            fiskalSisaBuku,
            fiskalLabaRugi,
            alasan: dto.alasan,
          },
          createdBy: userId,
        },
      });

      return disp;
    });

    return disposal;
  }

  // =========================================================================
  // 4. VOID PELEPASAN & PENURUNAN NILAI
  // =========================================================================

  /**
   * Membatalkan (Void) pelepasan/penghapusan aset:
   * - Periode pelepasan harus OPEN
   * - Membalik jurnal GL pelepasan via reverseJournal
   * - Mengembalikan status aset menjadi AKTIF / DISUSUTKAN_PENUH
   * - Menghitung ulang saldo dan jadwal
   */
  async voidDisposal(tenantId: string, disposalId: string, userId: string) {
    const disposal = await this.prisma.assetDisposal.findFirst({
      where: { id: disposalId, tenantId },
      include: { asset: true },
    });

    if (!disposal) {
      throw new NotFoundException('Dokumen pelepasan aset tidak ditemukan.');
    }

    if (disposal.status === AssetDisposalStatus.VOID) {
      throw new BadRequestException('Dokumen pelepasan ini sudah dibatalkan sebelumnya.');
    }

    await this.periodService.validateJournalDate(tenantId, disposal.tanggal);

    // 1. Reversal Jurnal GL jika ada
    if (disposal.journalId) {
      await this.journalService.reverseJournal(tenantId, disposal.journalId, {
        alasan: `Pembatalan Pelepasan Aset ${disposal.noDokumen}`,
      });
    }

    // 2. Batalkan CashBankEntry jika penjualan tunai
    if (disposal.tipe === AssetDisposalType.JUAL_TUNAI && disposal.journalId) {
      const entry = await this.prisma.cashBankEntry.findFirst({
        where: { journalId: disposal.journalId },
      });
      if (entry) {
        // Buat entri pembalik keluar
        await this.prisma.cashBankEntry.create({
          data: {
            tenantId,
            cashBankAccountId: entry.cashBankAccountId,
            tanggal: new Date(),
            arah: 'KELUAR',
            jumlah: entry.jumlah,
            jumlahFungsional: entry.jumlahFungsional,
            sourceType: 'OTHER',
            sourceDocId: disposal.noDokumen,
            keterangan: `Pembalik Penjualan Tunai Aset ${disposal.noDokumen}`,
          },
        });
      }
    }

    // 3. Batalkan entri catchup jika ada
    await this.prisma.assetDepreciationEntry.updateMany({
      where: {
        assetId: disposal.assetId,
        journal: {
          sourceDocType: 'ASSET_DEPRECIATION_CATCHUP',
          sourceDocId: disposal.asset.noAset,
        },
      },
      data: {
        status: DepreciationEntryStatus.REVERSED,
      },
    });

    // 4. Update status dokumen dan kartu aset
    await this.prisma.$transaction(async (tx) => {
      await tx.assetDisposal.update({
        where: { id: disposal.id },
        data: { status: AssetDisposalStatus.VOID },
      });

      // Kembalikan status aset
      await tx.fixedAsset.update({
        where: { id: disposal.assetId },
        data: {
          status: FixedAssetStatus.AKTIF,
        },
      });

      await tx.assetEvent.create({
        data: {
          assetId: disposal.assetId,
          tipe: AssetEventType.VOID,
          tanggal: new Date(),
          data: {
            deskripsi: `Pembatalan pelepasan aset ${disposal.noDokumen}`,
            disposalId: disposal.id,
          },
          createdBy: userId,
        },
      });
    });

    // 5. Sinkronkan ulang saldo dari entri aktif
    await this.depreciationService.verifyAndSyncAssetBalances(tenantId, disposal.assetId);

    return {
      success: true,
      message: `Pelepasan aset ${disposal.noDokumen} berhasil dibatalkan (VOID). Aset kembali aktif.`,
    };
  }

  /**
   * Membatalkan (Void) penurunan nilai (Impairment)
   */
  async voidImpairment(tenantId: string, impairmentId: string, userId: string) {
    const impairment = await this.prisma.assetImpairment.findFirst({
      where: { id: impairmentId, tenantId },
    });

    if (!impairment) {
      throw new NotFoundException('Dokumen penurunan nilai tidak ditemukan.');
    }

    if (impairment.status === AssetImpairmentStatus.VOID) {
      throw new BadRequestException('Dokumen penurunan nilai ini sudah dibatalkan sebelumnya.');
    }

    await this.periodService.validateJournalDate(tenantId, impairment.tanggal);

    if (impairment.journalId) {
      await this.journalService.reverseJournal(tenantId, impairment.journalId, {
        alasan: `Pembatalan Penurunan Nilai ${impairment.noDokumen}`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assetImpairment.update({
        where: { id: impairment.id },
        data: { status: AssetImpairmentStatus.VOID },
      });

      await tx.assetEvent.create({
        data: {
          assetId: impairment.assetId,
          tipe: AssetEventType.VOID,
          tanggal: new Date(),
          data: {
            deskripsi: `Pembatalan penurunan nilai aset ${impairment.noDokumen}`,
            impairmentId: impairment.id,
          },
          createdBy: userId,
        },
      });
    });

    await this.depreciationService.verifyAndSyncAssetBalances(tenantId, impairment.assetId);

    return {
      success: true,
      message: `Penurunan nilai ${impairment.noDokumen} berhasil dibatalkan.`,
    };
  }

  // =========================================================================
  // 5. QUERY LIST & TIMELINE
  // =========================================================================

  async getEvents(
    tenantId: string,
    filters?: {
      assetId?: string;
      tipe?: AssetEventType;
      tanggalAwal?: string;
      tanggalAkhir?: string;
    },
  ) {
    const where: any = {
      asset: { tenantId },
    };

    if (filters?.assetId) where.assetId = filters.assetId;
    if (filters?.tipe) where.tipe = filters.tipe;
    if (filters?.tanggalAwal || filters?.tanggalAkhir) {
      where.tanggal = {};
      if (filters.tanggalAwal) where.tanggal.gte = new Date(filters.tanggalAwal);
      if (filters.tanggalAkhir) where.tanggal.lte = new Date(filters.tanggalAkhir);
    }

    return this.prisma.assetEvent.findMany({
      where,
      include: {
        asset: {
          select: {
            id: true,
            noAset: true,
            nama: true,
            tagCode: true,
            status: true,
          },
        },
      },
      orderBy: { tanggal: 'desc' },
      take: 200,
    });
  }

  async getTransfers(tenantId: string, assetId?: string) {
    const where: any = { tenantId };
    if (assetId) where.assetId = assetId;

    return this.prisma.assetTransfer.findMany({
      where,
      include: {
        asset: { select: { id: true, noAset: true, nama: true } },
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  async getImpairments(tenantId: string, assetId?: string) {
    const where: any = { tenantId };
    if (assetId) where.assetId = assetId;

    return this.prisma.assetImpairment.findMany({
      where,
      include: {
        asset: { select: { id: true, noAset: true, nama: true } },
        journal: { select: { id: true, no_voucher: true } },
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  async getDisposals(tenantId: string, assetId?: string) {
    const where: any = { tenantId };
    if (assetId) where.assetId = assetId;

    return this.prisma.assetDisposal.findMany({
      where,
      include: {
        asset: { select: { id: true, noAset: true, nama: true } },
        journal: { select: { id: true, no_voucher: true } },
        cashBankAccount: { select: { id: true, kode: true, nama: true } },
        salesInvoiceLine: {
          select: {
            id: true,
            invoice: { select: { id: true, noDokumen: true } },
          },
        },
      },
      orderBy: { tanggal: 'desc' },
    });
  }
}

