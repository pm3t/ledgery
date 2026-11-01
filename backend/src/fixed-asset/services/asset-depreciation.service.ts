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
  EngineFiscalGroupInput,
  EngineEstimateChangeInput,
  EngineCostAdditionInput,
} from './depreciation-engine.service';
import {
  FixedAssetStatus,
  AssetEventType,
  DepreciationBook,
  DepreciationEntryStatus,
  AssetDepreciationRunStatus,
  PeriodStatus,
  DepreciationConvention,
} from '@prisma/client';
import {
  AddCostAdditionDto,
  RecordEstimateChangeDto,
} from '../dto/fixed-asset.dto';

export interface DepreciationPreviewItem {
  assetId: string;
  noAset: string;
  nama: string;
  kategoriNama: string;
  hargaPerolehan: number;
  nilaiTercatatSebelum: number;
  komersialBeban: number;
  fiskalBeban: number;
  nilaiTercatatSetelah: number;
  isCatchUp: boolean;
  catchUpBulanCount: number;
  akunBebanId: string;
  akunAkumulasiId: string;
  dimensions?: any;
}

export interface GlJournalLinePreview {
  kodeAkun: string;
  namaAkun: string;
  tipe: 'DEBIT' | 'KREDIT';
  jumlah: number;
  dimensions?: any;
}

export interface DepreciationPreviewResult {
  period: {
    id: string;
    nama: string;
    nomor_periode: number;
    tanggal_mulai: Date;
    tanggal_selesai: Date;
  };
  totalKomersial: number;
  totalFiskal: number;
  totalAssetsCount: number;
  catchUpAssetsCount: number;
  assets: DepreciationPreviewItem[];
  glJournalPreview: {
    debitLines: GlJournalLinePreview[];
    creditLines: GlJournalLinePreview[];
    isBalanced: boolean;
  };
  warnings: string[];
}

@Injectable()
export class AssetDepreciationService {
  private readonly logger = new Logger(AssetDepreciationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: DocumentNumberingService,
    private readonly subledgerPosting: SubledgerPostingService,
    private readonly journalService: JournalService,
    private readonly periodService: AccountingPeriodService,
    private readonly engine: DepreciationEngineService,
  ) {}

  /**
   * Helper untuk membentuk nama periode yang mudah dibaca
   */
  private formatPeriodName(period: { nomor_periode: number; fiscalYear?: { nama_tahun_buku: string } }): string {
    const yearName = period.fiscalYear?.nama_tahun_buku || '';
    return yearName ? `${yearName} - Periode ${period.nomor_periode}` : `Periode ${period.nomor_periode}`;
  }

  /**
   * Mengumpulkan dan menghitung simulasi beban penyusutan untuk satu periode akuntansi
   */
  async preview(tenantId: string, periodId: string): Promise<DepreciationPreviewResult> {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        id: periodId,
        fiscalYear: { tenantId },
      },
      include: {
        fiscalYear: true,
      },
    });

    if (!period) {
      throw new NotFoundException('Periode akuntansi tidak ditemukan.');
    }

    const periodName = this.formatPeriodName(period);

    if (period.status !== PeriodStatus.OPEN) {
      throw new BadRequestException(
        `Periode akuntansi '${periodName}' harus berstatus OPEN untuk menjalankan simulasi atau posting penyusutan.`,
      );
    }

    const warnings: string[] = [];

    // Cek apakah sudah pernah diposting
    const existingRun = await this.prisma.assetDepreciationRun.findFirst({
      where: { tenantId, periodId, status: AssetDepreciationRunStatus.POSTED },
    });
    if (existingRun) {
      warnings.push(
        `Penyusutan untuk periode ${periodName} sudah pernah diposting dengan nomor dokumen '${existingRun.noDokumen}'. Batalkan (reverse) proses tersebut terlebih dahulu jika ingin memposting ulang.`,
      );
    }

    // Ambil konvensi dari subledger setting
    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });
    const convention =
      setting?.depreciationConvention || DepreciationConvention.BULAN_PENUH;

    const targetDate = new Date(period.tanggal_selesai);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1; // 1 - 12

    // Ambil seluruh aset aktif dan dapat disusutkan
    const assets = await this.prisma.fixedAsset.findMany({
      where: {
        tenantId,
        status: { in: [FixedAssetStatus.AKTIF, FixedAssetStatus.DISUSUTKAN_PENUH] },
        category: { dapatDisusutkan: true },
      },
      include: {
        category: {
          include: {
            akunAset: true,
            akunAkumulasi: true,
            akunBeban: true,
          },
        },
        fiscalGroup: true,
        estimateChanges: { orderBy: { createdAt: 'asc' } },
        costAdditions: { where: { status: 'POSTED' }, orderBy: { tanggal: 'asc' } },
        impairments: { where: { status: 'POSTED' }, orderBy: { tanggal: 'asc' } },
        dimensionHistories: {
          where: { berlakuMulai: { lte: targetDate } },
          orderBy: [{ berlakuMulai: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
      orderBy: { noAset: 'asc' },
    });

    // Ambil semua entri aktif yang sudah pernah diposting
    const existingEntries = await this.prisma.assetDepreciationEntry.findMany({
      where: {
        tenantId,
        status: DepreciationEntryStatus.AKTIF,
      },
      select: {
        assetId: true,
        buku: true,
        periodeBukuTahun: true,
        periodeBukuBulan: true,
      },
    });

    const postedSet = new Set<string>();
    for (const ent of existingEntries) {
      postedSet.add(`${ent.assetId}-${ent.buku}-${ent.periodeBukuTahun}-${ent.periodeBukuBulan}`);
    }

    const previewItems: DepreciationPreviewItem[] = [];
    let totalKomersial = 0;
    let totalFiskal = 0;
    let catchUpAssetsCount = 0;

    // Peta agregasi untuk preview jurnal GL: key = `${akunBebanId}|${akunAkumulasiId}|${dimensionsJson}`
    const glDebitMap = new Map<string, { kodeAkun: string; namaAkun: string; jumlah: number; dimensions?: any }>();
    const glCreditMap = new Map<string, { kodeAkun: string; namaAkun: string; jumlah: number; dimensions?: any }>();

    for (const asset of assets) {
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

      const engineFiscalGroup: EngineFiscalGroupInput | null = asset.fiscalGroup
        ? {
            id: asset.fiscalGroup.id,
            kode: asset.fiscalGroup.kode,
            nama: asset.fiscalGroup.nama,
            jenis: asset.fiscalGroup.jenis,
            masaManfaatBulan: asset.fiscalGroup.masaManfaatBulan,
            tarifGarisLurus: Number(asset.fiscalGroup.tarifGarisLurus),
            tarifSaldoMenurun: asset.fiscalGroup.tarifSaldoMenurun
              ? Number(asset.fiscalGroup.tarifSaldoMenurun)
              : null,
          }
        : null;

      const engineEstimateChanges: EngineEstimateChangeInput[] = asset.estimateChanges.map((ec) => ({
        berlakuMulaiPeriode: ec.berlakuMulaiPeriode,
        umurBaruBulan: ec.umurBaruBulan,
        sisaUmurBulan: ec.sisaUmurBulan,
        residuBaru: ec.residuBaru ? Number(ec.residuBaru) : null,
        metodeBaru: ec.metodeBaru,
      }));

      const engineCostAdditions: EngineCostAdditionInput[] = asset.costAdditions.map((ca) => ({
        tanggal: ca.tanggal,
        jumlah: Number(ca.jumlah),
      }));

      const engineImpairments = (asset as any).impairments?.map((im: any) => ({
        tanggal: im.tanggal,
        jumlah: Number(im.jumlah),
      })) || [];

      // Resolusi Dimensi Efektif: Prioritaskan riwayat mutasi dimensi terakhir sebelum/pada target periode
      const effectiveDimensions = (asset as any).dimensionHistories?.[0]?.dimensions || asset.dimensions;

      // Generate jadwal lengkap dari mesin penyusutan murni
      const schedule = this.engine.generateFullSchedule(
        engineAsset,
        engineFiscalGroup,
        convention,
        engineEstimateChanges,
        engineCostAdditions,
        engineImpairments,
      );

      // Filter item komersial yang belum diposting sampai dengan target periode
      const unpostedKomersial = schedule.komersial.filter((item) => {
        const isUpToTarget =
          item.tahun < targetYear ||
          (item.tahun === targetYear && item.bulan <= targetMonth);
        const alreadyPosted = postedSet.has(`${asset.id}-KOMERSIAL-${item.tahun}-${item.bulan}`);
        return isUpToTarget && !alreadyPosted;
      });

      // Filter item fiskal yang belum diposting sampai dengan target periode
      const unpostedFiskal = schedule.fiskal.filter((item) => {
        const isUpToTarget =
          item.tahun < targetYear ||
          (item.tahun === targetYear && item.bulan <= targetMonth);
        const alreadyPosted = postedSet.has(`${asset.id}-FISKAL-${item.tahun}-${item.bulan}`);
        return isUpToTarget && !alreadyPosted;
      });

      if (unpostedKomersial.length === 0 && unpostedFiskal.length === 0) {
        continue;
      }

      // Deteksi catch-up
      const hasCatchUp = unpostedKomersial.some(
        (it) => it.tahun < targetYear || (it.tahun === targetYear && it.bulan < targetMonth),
      );
      const catchUpCount = unpostedKomersial.filter(
        (it) => it.tahun < targetYear || (it.tahun === targetYear && it.bulan < targetMonth),
      ).length;

      if (hasCatchUp) {
        catchUpAssetsCount += 1;
      }

      const assetKomersialBeban = this.engine.round2(
        unpostedKomersial.reduce((sum, it) => sum + it.beban, 0),
      );
      const assetFiskalBeban = this.engine.round2(
        unpostedFiskal.reduce((sum, it) => sum + it.beban, 0),
      );

      const nilaiTercatatSebelum = Number(asset.nilaiTercatat);
      const nilaiTercatatSetelah = Math.max(
        Number(asset.nilaiResidu || 0),
        this.engine.round2(nilaiTercatatSebelum - assetKomersialBeban),
      );

      totalKomersial = this.engine.round2(totalKomersial + assetKomersialBeban);
      totalFiskal = this.engine.round2(totalFiskal + assetFiskalBeban);

      previewItems.push({
        assetId: asset.id,
        noAset: asset.noAset,
        nama: asset.nama,
        kategoriNama: asset.category.nama,
        hargaPerolehan: Number(asset.hargaPerolehan),
        nilaiTercatatSebelum,
        komersialBeban: assetKomersialBeban,
        fiskalBeban: assetFiskalBeban,
        nilaiTercatatSetelah,
        isCatchUp: hasCatchUp,
        catchUpBulanCount: catchUpCount,
        akunBebanId: asset.category.akunBebanId,
        akunAkumulasiId: asset.category.akunAkumulasiId,
        dimensions: effectiveDimensions,
      });

      // Agregasi GL Debit & Kredit jika ada beban komersial
      if (assetKomersialBeban > 0) {
        const dimStr = JSON.stringify(effectiveDimensions || {});
        const debitKey = `${asset.category.akunBebanId}|${dimStr}`;
        const creditKey = `${asset.category.akunAkumulasiId}|${dimStr}`;

        // Debit: Beban Penyusutan
        const existingDeb = glDebitMap.get(debitKey);
        if (existingDeb) {
          existingDeb.jumlah = this.engine.round2(existingDeb.jumlah + assetKomersialBeban);
        } else {
          glDebitMap.set(debitKey, {
            kodeAkun: asset.category.akunBeban.kode_akun,
            namaAkun: asset.category.akunBeban.nama_akun,
            jumlah: assetKomersialBeban,
            dimensions: effectiveDimensions,
          });
        }

        // Kredit: Akumulasi Penyusutan
        const existingCred = glCreditMap.get(creditKey);
        if (existingCred) {
          existingCred.jumlah = this.engine.round2(existingCred.jumlah + assetKomersialBeban);
        } else {
          glCreditMap.set(creditKey, {
            kodeAkun: asset.category.akunAkumulasi.kode_akun,
            namaAkun: asset.category.akunAkumulasi.nama_akun,
            jumlah: assetKomersialBeban,
            dimensions: effectiveDimensions,
          });
        }
      }
    }

    if (catchUpAssetsCount > 0) {
      warnings.push(
        `Terdeteksi ${catchUpAssetsCount} aset dengan penyusutan susulan (catch-up) dari periode lampau. Beban seluruh bulan tertunggak akan diakui secara agregat pada periode berjalan (${periodName}).`,
      );
    }

    const debitLines = Array.from(glDebitMap.values()).map((d) => ({
      ...d,
      tipe: 'DEBIT' as const,
    }));
    const creditLines = Array.from(glCreditMap.values()).map((c) => ({
      ...c,
      tipe: 'KREDIT' as const,
    }));

    const sumDebits = this.engine.round2(debitLines.reduce((s, l) => s + l.jumlah, 0));
    const sumCredits = this.engine.round2(creditLines.reduce((s, l) => s + l.jumlah, 0));

    return {
      period: {
        id: period.id,
        nama: periodName,
        nomor_periode: period.nomor_periode,
        tanggal_mulai: period.tanggal_mulai,
        tanggal_selesai: period.tanggal_selesai,
      },
      totalKomersial,
      totalFiskal,
      totalAssetsCount: previewItems.length,
      catchUpAssetsCount,
      assets: previewItems,
      glJournalPreview: {
        debitLines,
        creditLines,
        isBalanced: sumDebits === sumCredits,
      },
      warnings,
    };
  }

  /**
   * Menjalankan posting proses penyusutan bulanan secara atomik:
   * 1. Menghitung entri buku Komersial & Fiskal
   * 2. Membuat Jurnal Umum GL untuk buku Komersial (Dr Beban / Cr Akumulasi) dengan dimensi
   * 3. Menyimpan header AssetDepreciationRun & detail AssetDepreciationEntry
   * 4. Memperbarui nilai buku & status aset (DISUSUTKAN_PENUH)
   * 5. Mencatat audit trail AssetEvent
   */
  async post(tenantId: string, periodId: string, userId: string) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        id: periodId,
        fiscalYear: { tenantId },
      },
      include: {
        fiscalYear: true,
      },
    });

    if (!period) throw new NotFoundException('Periode akuntansi tidak ditemukan.');

    const periodName = this.formatPeriodName(period);

    if (period.status !== PeriodStatus.OPEN) {
      throw new BadRequestException('Periode akuntansi harus berstatus OPEN untuk posting penyusutan.');
    }

    // Pastikan belum ada run POSTED untuk periode ini
    const existingRun = await this.prisma.assetDepreciationRun.findFirst({
      where: { tenantId, periodId, status: AssetDepreciationRunStatus.POSTED },
    });
    if (existingRun) {
      throw new BadRequestException(
        `Penyusutan periode ${periodName} sudah pernah diposting dengan nomor dokumen '${existingRun.noDokumen}'. Batalkan proses sebelumnya terlebih dahulu.`,
      );
    }

    // Ambil kalkulasi preview
    const preview = await this.preview(tenantId, periodId);
    if (preview.assets.length === 0 || (preview.totalKomersial === 0 && preview.totalFiskal === 0)) {
      throw new BadRequestException('Tidak ada aset tetap yang memerlukan penyusutan pada periode ini.');
    }

    // 1. Generate nomor dokumen penyusutan
    const noDokumen = await this.numberingService.getNextNumber(
      tenantId,
      SubledgerDocType.DEPRECIATION_RUN,
    );

    // 2. Buat Jurnal GL untuk buku Komersial (jika totalKomersial > 0)
    let journalId: string | null = null;
    if (preview.totalKomersial > 0) {
      const entries: Array<{
        kode_akun: string;
        tipe: 'DEBIT' | 'KREDIT';
        jumlah: number;
        dimensions?: any;
      }> = [];

      for (const deb of preview.glJournalPreview.debitLines) {
        entries.push({
          kode_akun: deb.kodeAkun,
          tipe: 'DEBIT',
          jumlah: deb.jumlah,
          dimensions: deb.dimensions,
        });
      }

      for (const cred of preview.glJournalPreview.creditLines) {
        entries.push({
          kode_akun: cred.kodeAkun,
          tipe: 'KREDIT',
          jumlah: cred.jumlah,
          dimensions: cred.dimensions,
        });
      }

      const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
        tanggal: period.tanggal_selesai.toISOString().slice(0, 10),
        deskripsi: `Penyusutan Aset Tetap Periode ${periodName} (${noDokumen})`,
        sumber_aplikasi: 'SUBLEDGER-FIXED-ASSET',
        sourceDocType: 'DEPRECIATION_RUN',
        sourceDocId: noDokumen,
        no_voucher: noDokumen,
        mata_uang: 'IDR',
        entries,
      });

      journalId = journal.id;
    }

    // 3. Simpan ke database dalam Prisma Transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Buat Header Run
      const run = await tx.assetDepreciationRun.create({
        data: {
          tenantId,
          noDokumen,
          periodId,
          status: AssetDepreciationRunStatus.POSTED,
          totalKomersial: preview.totalKomersial,
          totalFiskal: preview.totalFiskal,
          journalId,
          createdBy: userId,
          postedAt: new Date(),
        },
      });

      // Ambil ulang jadwal per aset untuk menyisipkan entri bulanan
      const setting = await tx.subledgerSetting.findUnique({ where: { tenantId } });
      const convention = setting?.depreciationConvention || DepreciationConvention.BULAN_PENUH;

      const targetDate = new Date(period.tanggal_selesai);
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth() + 1;

      // Ambil posted set aktif saat ini
      const activeEntries = await tx.assetDepreciationEntry.findMany({
        where: { tenantId, status: DepreciationEntryStatus.AKTIF },
        select: { assetId: true, buku: true, periodeBukuTahun: true, periodeBukuBulan: true },
      });
      const postedSet = new Set<string>();
      for (const ent of activeEntries) {
        postedSet.add(`${ent.assetId}-${ent.buku}-${ent.periodeBukuTahun}-${ent.periodeBukuBulan}`);
      }

      for (const item of preview.assets) {
        const asset = await tx.fixedAsset.findUnique({
          where: { id: item.assetId },
          include: {
            category: true,
            fiscalGroup: true,
            estimateChanges: { orderBy: { createdAt: 'asc' } },
            costAdditions: { where: { status: 'POSTED' }, orderBy: { tanggal: 'asc' } },
            impairments: { where: { status: 'POSTED' }, orderBy: { tanggal: 'asc' } },
          },
        });
        if (!asset) continue;

        const engineAsset: EngineAssetInput = {
          id: asset.id,
          hargaPerolehan: Number(asset.hargaPerolehan),
          nilaiResidu: Number(asset.nilaiResidu || 0),
          umurManfaatBulan: asset.umurManfaatBulan,
          metodeKomersial: asset.metodeKomersial,
          faktorSaldoMenurun: Number(asset.faktorSaldoMenurun || 2),
          tanggalPerolehan: asset.tanggalPerolehan,
          tanggalMulaiDigunakan: asset.tanggalMulaiDigunakan,
          dapatDisusutkan: true,
          fiscalGroupId: asset.fiscalGroupId,
          metodeFiskal: asset.metodeFiskal,
          aturanMulaiFiskal: asset.category.aturanMulaiFiskal,
          fiskalMulaiTanggal: asset.fiskalMulaiTanggal,
          fiskalUmurOverrideBulan: asset.fiskalUmurOverrideBulan,
        };

        const schedule = this.engine.generateFullSchedule(
          engineAsset,
          asset.fiscalGroup ? {
            id: asset.fiscalGroup.id,
            kode: asset.fiscalGroup.kode,
            nama: asset.fiscalGroup.nama,
            jenis: asset.fiscalGroup.jenis,
            masaManfaatBulan: asset.fiscalGroup.masaManfaatBulan,
            tarifGarisLurus: Number(asset.fiscalGroup.tarifGarisLurus),
            tarifSaldoMenurun: asset.fiscalGroup.tarifSaldoMenurun ? Number(asset.fiscalGroup.tarifSaldoMenurun) : null,
          } : null,
          convention,
          asset.estimateChanges.map((ec) => ({
            berlakuMulaiPeriode: ec.berlakuMulaiPeriode,
            umurBaruBulan: ec.umurBaruBulan,
            sisaUmurBulan: ec.sisaUmurBulan,
            residuBaru: ec.residuBaru ? Number(ec.residuBaru) : null,
            metodeBaru: ec.metodeBaru,
          })),
          asset.costAdditions.map((ca) => ({
            tanggal: ca.tanggal,
            jumlah: Number(ca.jumlah),
          })),
          (asset as any).impairments?.map((im: any) => ({
            tanggal: im.tanggal,
            jumlah: Number(im.jumlah),
          })) || [],
        );

        // Buat entri Komersial
        for (const kItem of schedule.komersial) {
          const isUpToTarget =
            kItem.tahun < targetYear ||
            (kItem.tahun === targetYear && kItem.bulan <= targetMonth);
          const key = `${asset.id}-KOMERSIAL-${kItem.tahun}-${kItem.bulan}`;
          if (isUpToTarget && !postedSet.has(key)) {
            const isCatchUp =
              kItem.tahun < targetYear ||
              (kItem.tahun === targetYear && kItem.bulan < targetMonth);

            await tx.assetDepreciationEntry.create({
              data: {
                tenantId,
                assetId: asset.id,
                runId: run.id,
                buku: DepreciationBook.KOMERSIAL,
                periodeBukuTahun: kItem.tahun,
                periodeBukuBulan: kItem.bulan,
                periodeBebanId: periodId,
                jumlah: kItem.beban,
                akumulasiSetelah: kItem.akumulasi,
                nilaiTercatatSetelah: kItem.nilaiTercatat,
                isCatchUp,
                status: DepreciationEntryStatus.AKTIF,
                periode: kItem.periodeStr,
                tanggal: period.tanggal_selesai,
                jumlahKomersial: kItem.beban,
                akumulasiKomersial: kItem.akumulasi,
                nilaiBukuKomersial: kItem.nilaiTercatat,
                journalId,
              },
            });
            postedSet.add(key);
          }
        }

        // Buat entri Fiskal (buku paralel tanpa jurnal GL)
        for (const fItem of schedule.fiskal) {
          const isUpToTarget =
            fItem.tahun < targetYear ||
            (fItem.tahun === targetYear && fItem.bulan <= targetMonth);
          const key = `${asset.id}-FISKAL-${fItem.tahun}-${fItem.bulan}`;
          if (isUpToTarget && !postedSet.has(key)) {
            const isCatchUp =
              fItem.tahun < targetYear ||
              (fItem.tahun === targetYear && fItem.bulan < targetMonth);

            await tx.assetDepreciationEntry.create({
              data: {
                tenantId,
                assetId: asset.id,
                runId: run.id,
                buku: DepreciationBook.FISKAL,
                periodeBukuTahun: fItem.tahun,
                periodeBukuBulan: fItem.bulan,
                periodeBebanId: periodId,
                jumlah: fItem.beban,
                akumulasiSetelah: fItem.akumulasi,
                nilaiTercatatSetelah: fItem.nilaiTercatat,
                isCatchUp,
                status: DepreciationEntryStatus.AKTIF,
                periode: fItem.periodeStr,
                tanggal: period.tanggal_selesai,
                jumlahFiskal: fItem.beban,
                akumulasiFiskal: fItem.akumulasi,
                nilaiBukuFiskal: fItem.nilaiTercatat,
                journalId: null, // Fiskal TIDAK dijurnal ke GL
              },
            });
            postedSet.add(key);
          }
        }

        // Hitung ulang akumulasi dan nilai tercatat aset
        const allKomersialEntries = await tx.assetDepreciationEntry.findMany({
          where: {
            assetId: asset.id,
            buku: DepreciationBook.KOMERSIAL,
            status: DepreciationEntryStatus.AKTIF,
          },
        });
        const allFiskalEntries = await tx.assetDepreciationEntry.findMany({
          where: {
            assetId: asset.id,
            buku: DepreciationBook.FISKAL,
            status: DepreciationEntryStatus.AKTIF,
          },
        });

        const totalAkumulasiKomersial = this.engine.round2(
          allKomersialEntries.reduce((s, e) => s + Number(e.jumlah), 0),
        );
        const totalAkumulasiFiskal = this.engine.round2(
          allFiskalEntries.reduce((s, e) => s + Number(e.jumlah), 0),
        );

        const newNilaiTercatat = this.engine.round2(
          Number(asset.hargaPerolehan) - totalAkumulasiKomersial,
        );
        const newNilaiSisaBukuFiskal = this.engine.round2(
          Number(asset.hargaPerolehan) - totalAkumulasiFiskal,
        );

        const isFullyDepreciated = newNilaiTercatat <= Number(asset.nilaiResidu || 0);

        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            akumulasiKomersial: totalAkumulasiKomersial,
            akumulasiFiskal: totalAkumulasiFiskal,
            nilaiTercatat: newNilaiTercatat,
            nilaiSisaBukuFiskal: newNilaiSisaBukuFiskal,
            status: isFullyDepreciated
              ? FixedAssetStatus.DISUSUTKAN_PENUH
              : FixedAssetStatus.AKTIF,
          },
        });

        // Catat AssetEvent
        await tx.assetEvent.create({
          data: {
            assetId: asset.id,
            tipe: AssetEventType.PENYUSUTAN,
            tanggal: new Date(),
            data: {
              deskripsi: `Penyusutan periode ${periodName} (${noDokumen}): Komersial Rp${item.komersialBeban.toLocaleString('id-ID')}, Fiskal Rp${item.fiskalBeban.toLocaleString('id-ID')}`,
              nilaiTercatatSebelum: item.nilaiTercatatSebelum,
              nilaiTercatatSesudah: newNilaiTercatat,
              isFullyDepreciated,
            },
            createdBy: userId,
          },
        });
      }

      return run;
    });

    this.logger.log(
      `Penyusutan aset periode ${periodName} (${noDokumen}) berhasil diposting oleh user ${userId}. Total Komersial: Rp${preview.totalKomersial}, Total Fiskal: Rp${preview.totalFiskal}.`,
    );

    return {
      success: true,
      run: result,
      totalKomersial: preview.totalKomersial,
      totalFiskal: preview.totalFiskal,
      assetsCount: preview.assets.length,
      journalId,
    };
  }

  /**
   * Membatalkan proses penyusutan (Reversal):
   * 1. Membalik jurnal GL komersial via JournalService.reverseJournal
   * 2. Menandai AssetDepreciationRun dan entri-entrinya sebagai REVERSED
   * 3. Menghitung kembali denormalisasi saldo pada kartu aset
   */
  async reverse(tenantId: string, runId: string, userId: string) {
    const run = await this.prisma.assetDepreciationRun.findFirst({
      where: { id: runId, tenantId },
      include: {
        period: {
          include: { fiscalYear: true },
        },
        entries: true,
      },
    });

    if (!run) {
      throw new NotFoundException('Proses penyusutan tidak ditemukan.');
    }
    if (run.status === AssetDepreciationRunStatus.REVERSED) {
      throw new BadRequestException('Proses penyusutan ini sudah dibatalkan sebelumnya.');
    }

    const periodName = this.formatPeriodName(run.period);

    if (run.period.status !== PeriodStatus.OPEN) {
      throw new BadRequestException(
        `Periode akuntansi '${periodName}' sudah DITUTUP. Buka kembali periode tersebut sebelum membatalkan proses penyusutan.`,
      );
    }

    // 1. Reversal Jurnal GL jika ada
    if (run.journalId) {
      await this.journalService.reverseJournal(tenantId, run.journalId, {
        alasan: `Pembatalan Penyusutan Aset Tetap ${run.noDokumen}`,
      });
    }

    // 2. Update status run & entries dalam transaksi
    await this.prisma.$transaction(async (tx) => {
      await tx.assetDepreciationRun.update({
        where: { id: run.id },
        data: {
          status: AssetDepreciationRunStatus.REVERSED,
          reversedAt: new Date(),
          reversedBy: userId,
        },
      });

      await tx.assetDepreciationEntry.updateMany({
        where: { runId: run.id },
        data: {
          status: DepreciationEntryStatus.REVERSED,
        },
      });

      // Kumpulkan ID aset yang terpengaruh
      const affectedAssetIds = Array.from(new Set(run.entries.map((e) => e.assetId)));

      for (const assetId of affectedAssetIds) {
        const asset = await tx.fixedAsset.findUnique({ where: { id: assetId } });
        if (!asset) continue;

        const allKomersialEntries = await tx.assetDepreciationEntry.findMany({
          where: {
            assetId,
            buku: DepreciationBook.KOMERSIAL,
            status: DepreciationEntryStatus.AKTIF,
          },
        });
        const allFiskalEntries = await tx.assetDepreciationEntry.findMany({
          where: {
            assetId,
            buku: DepreciationBook.FISKAL,
            status: DepreciationEntryStatus.AKTIF,
          },
        });

        const totalAkumulasiKomersial = this.engine.round2(
          allKomersialEntries.reduce((s, e) => s + Number(e.jumlah), 0),
        );
        const totalAkumulasiFiskal = this.engine.round2(
          allFiskalEntries.reduce((s, e) => s + Number(e.jumlah), 0),
        );

        const newNilaiTercatat = this.engine.round2(
          Number(asset.hargaPerolehan) - totalAkumulasiKomersial,
        );
        const newNilaiSisaBukuFiskal = this.engine.round2(
          Number(asset.hargaPerolehan) - totalAkumulasiFiskal,
        );

        const isFullyDepreciated = newNilaiTercatat <= Number(asset.nilaiResidu || 0);

        await tx.fixedAsset.update({
          where: { id: assetId },
          data: {
            akumulasiKomersial: totalAkumulasiKomersial,
            akumulasiFiskal: totalAkumulasiFiskal,
            nilaiTercatat: newNilaiTercatat,
            nilaiSisaBukuFiskal: newNilaiSisaBukuFiskal,
            status: isFullyDepreciated
              ? FixedAssetStatus.DISUSUTKAN_PENUH
              : FixedAssetStatus.AKTIF,
          },
        });

        await tx.assetEvent.create({
          data: {
            assetId,
            tipe: AssetEventType.PENYUSUTAN,
            tanggal: new Date(),
            data: {
              deskripsi: `Pembatalan penyusutan dokumen ${run.noDokumen}`,
            },
            createdBy: userId,
          },
        });
      }
    });

    return {
      success: true,
      message: `Proses penyusutan ${run.noDokumen} berhasil dibatalkan (reversed).`,
    };
  }

  /**
   * Menampilkan riwayat daftar proses penyusutan bulanan (AssetDepreciationRun)
   */
  async getRuns(tenantId: string) {
    return this.prisma.assetDepreciationRun.findMany({
      where: { tenantId },
      include: {
        period: {
          select: {
            id: true,
            nomor_periode: true,
            status: true,
            tanggal_mulai: true,
            tanggal_selesai: true,
            fiscalYear: {
              select: {
                nama_tahun_buku: true,
              },
            },
          },
        },
        journal: {
          select: {
            id: true,
            no_voucher: true,
            status: true,
          },
        },
        _count: {
          select: { entries: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Menambahkan pengeluaran lanjutan yang dikapitalisasi (AssetCostAddition)
   * Dr Akun Aset / Cr Akun Lawan (Kas/Bank/Utang)
   */
  async addCostAddition(
    tenantId: string,
    assetId: string,
    dto: AddCostAdditionDto,
    userId: string,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
      include: {
        category: {
          include: { akunAset: true },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Kartu aset tetap tidak ditemukan.');
    }
    if (asset.status !== FixedAssetStatus.AKTIF && asset.status !== FixedAssetStatus.DISUSUTKAN_PENUH) {
      throw new BadRequestException('Penambahan nilai hanya dapat dilakukan pada aset berstatus AKTIF atau DISUSUTKAN_PENUH.');
    }

    const tgl = new Date(dto.tanggal);
    await this.periodService.validateJournalDate(tenantId, tgl);

    const akunLawan = await this.prisma.chartOfAccount.findFirst({
      where: { id: dto.akunLawanId, tenantId },
    });
    if (!akunLawan) {
      throw new BadRequestException('Akun lawan GL tidak ditemukan.');
    }

    const noDokumen = await this.numberingService.getNextNumber(
      tenantId,
      SubledgerDocType.ASSET_COST_ADDITION,
    );

    // Buat Jurnal GL: Dr Akun Aset / Cr Akun Lawan
    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: dto.tanggal,
      deskripsi: `Penambahan Nilai Aset ${asset.noAset} - ${dto.deskripsi || asset.nama}`,
      sumber_aplikasi: 'SUBLEDGER-FIXED-ASSET',
      sourceDocType: 'ASSET_COST_ADDITION',
      sourceDocId: noDokumen,
      no_voucher: noDokumen,
      mata_uang: asset.mata_uang,
      entries: [
        {
          kode_akun: asset.category.akunAset.kode_akun,
          tipe: 'DEBIT',
          jumlah: dto.jumlah,
          dimensions: dto.dimensions || (asset.dimensions as any),
        },
        {
          kode_akun: akunLawan.kode_akun,
          tipe: 'KREDIT',
          jumlah: dto.jumlah,
          dimensions: dto.dimensions || (asset.dimensions as any),
        },
      ],
    });

    const costAddition = await this.prisma.$transaction(async (tx) => {
      const ca = await tx.assetCostAddition.create({
        data: {
          tenantId,
          noDokumen,
          assetId: asset.id,
          tanggal: tgl,
          jumlah: dto.jumlah,
          akunLawanId: dto.akunLawanId,
          sumber: dto.sumber || 'KAS',
          journalId: journal.id,
          status: 'POSTED',
          deskripsi: dto.deskripsi,
          createdBy: userId,
        },
      });

      const newHargaPerolehan = this.engine.round2(Number(asset.hargaPerolehan) + dto.jumlah);
      const newNilaiTercatat = this.engine.round2(Number(asset.nilaiTercatat) + dto.jumlah);
      const newNilaiSisaBukuFiskal = this.engine.round2(Number(asset.nilaiSisaBukuFiskal) + dto.jumlah);

      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          hargaPerolehan: newHargaPerolehan,
          nilaiTercatat: newNilaiTercatat,
          nilaiSisaBukuFiskal: newNilaiSisaBukuFiskal,
          status: FixedAssetStatus.AKTIF, // Reaktifkan bila sebelumnya DISUSUTKAN_PENUH
        },
      });

      await tx.assetEvent.create({
        data: {
          assetId: asset.id,
          tipe: AssetEventType.PENAMBAHAN_NILAI,
          tanggal: new Date(),
          data: {
            deskripsi: `Penambahan nilai (pengeluaran lanjutan) Rp${dto.jumlah.toLocaleString('id-ID')} (${noDokumen}): ${dto.deskripsi || '-'}`,
            hargaPerolehanBaru: newHargaPerolehan,
            nilaiTercatatBaru: newNilaiTercatat,
          },
          createdBy: userId,
        },
      });

      return ca;
    });

    return costAddition;
  }

  /**
   * Mencatat perubahan estimasi akuntansi secara prospektif (AssetEstimateChange)
   */
  async recordEstimateChange(
    tenantId: string,
    assetId: string,
    dto: RecordEstimateChangeDto,
    userId: string,
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
    });
    if (!asset) {
      throw new NotFoundException('Kartu aset tetap tidak ditemukan.');
    }

    const change = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.assetEstimateChange.create({
        data: {
          tenantId,
          assetId: asset.id,
          berlakuMulaiPeriode: dto.berlakuMulaiPeriode,
          umurBaruBulan: dto.umurBaruBulan,
          sisaUmurBulan: dto.sisaUmurBulan,
          residuBaru: dto.residuBaru !== undefined ? dto.residuBaru : null,
          metodeBaru: dto.metodeBaru,
          alasan: dto.alasan,
          createdBy: userId,
        },
      });

      const updateData: any = {};
      if (dto.umurBaruBulan) updateData.umurManfaatBulan = dto.umurBaruBulan;
      if (dto.residuBaru !== undefined) updateData.nilaiResidu = dto.residuBaru;
      if (dto.metodeBaru) updateData.metodeKomersial = dto.metodeBaru;

      if (Object.keys(updateData).length > 0) {
        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: updateData,
        });
      }

      await tx.assetEvent.create({
        data: {
          assetId: asset.id,
          tipe: AssetEventType.PERUBAHAN_ESTIMASI,
          tanggal: new Date(),
          data: {
            deskripsi: `Perubahan estimasi akuntansi mulai ${dto.berlakuMulaiPeriode}: ${dto.alasan}`,
            dataSebelum: {
              umurManfaatBulan: asset.umurManfaatBulan,
              nilaiResidu: asset.nilaiResidu,
              metodeKomersial: asset.metodeKomersial,
            },
            dataSesudah: {
              ...updateData,
            },
          },
          createdBy: userId,
        },
      });

      return rec;
    });

    return change;
  }

  /**
   * Mengambil jadwal proyeksi penyusutan komparatif (Komersial & Fiskal) untuk satu aset
   */
  async getAssetSchedule(tenantId: string, assetId: string, role?: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
      include: {
        category: true,
        fiscalGroup: true,
        estimateChanges: { orderBy: { createdAt: 'asc' } },
        costAdditions: { where: { status: 'POSTED' }, orderBy: { tanggal: 'asc' } },
        impairments: { where: { status: 'POSTED' }, orderBy: { tanggal: 'asc' } },
        depreciationEntries: {
          where: { status: DepreciationEntryStatus.AKTIF },
          include: {
            run: { select: { noDokumen: true } },
          },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Kartu aset tetap tidak ditemukan.');
    }

    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });
    const convention =
      setting?.depreciationConvention || DepreciationConvention.BULAN_PENUH;

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

    const fiscalGroupInput: EngineFiscalGroupInput | null = asset.fiscalGroup
      ? {
          id: asset.fiscalGroup.id,
          kode: asset.fiscalGroup.kode,
          nama: asset.fiscalGroup.nama,
          jenis: asset.fiscalGroup.jenis,
          masaManfaatBulan: asset.fiscalGroup.masaManfaatBulan,
          tarifGarisLurus: Number(asset.fiscalGroup.tarifGarisLurus),
          tarifSaldoMenurun: asset.fiscalGroup.tarifSaldoMenurun
            ? Number(asset.fiscalGroup.tarifSaldoMenurun)
            : null,
        }
      : null;

    const schedule = this.engine.generateFullSchedule(
      engineAsset,
      fiscalGroupInput,
      convention,
      asset.estimateChanges.map((ec) => ({
        berlakuMulaiPeriode: ec.berlakuMulaiPeriode,
        umurBaruBulan: ec.umurBaruBulan,
        sisaUmurBulan: ec.sisaUmurBulan,
        residuBaru: ec.residuBaru ? Number(ec.residuBaru) : null,
        metodeBaru: ec.metodeBaru,
      })),
      asset.costAdditions.map((ca) => ({
        tanggal: ca.tanggal,
        jumlah: Number(ca.jumlah),
      })),
      (asset as any).impairments?.map((im: any) => ({
        tanggal: im.tanggal,
        jumlah: Number(im.jumlah),
      })) || [],
    );

    // Cocokkan status posting per bulan
    const entryMap = new Map<string, any>();
    for (const ent of asset.depreciationEntries) {
      entryMap.set(`${ent.buku}-${ent.periodeBukuTahun}-${ent.periodeBukuBulan}`, ent);
    }

    const komersialWithStatus = schedule.komersial.map((it) => {
      const ent = entryMap.get(`KOMERSIAL-${it.tahun}-${it.bulan}`);
      return {
        ...it,
        isPosted: !!ent,
        runNoDokumen: ent?.run?.noDokumen || null,
        entryId: ent?.id || null,
      };
    });

    const fiskalWithStatus = schedule.fiskal.map((it) => {
      const ent = entryMap.get(`FISKAL-${it.tahun}-${it.bulan}`);
      return {
        ...it,
        isPosted: !!ent,
        runNoDokumen: ent?.run?.noDokumen || null,
        entryId: ent?.id || null,
      };
    });

    // Sanitasi keamanan jika dipanggil oleh peran PETUGAS_ASET
    const isPetugasAset = role === 'PETUGAS_ASET';
    if (isPetugasAset) {
      return {
        assetId: asset.id,
        noAset: asset.noAset,
        nama: asset.nama,
        komersial: komersialWithStatus.map((k) => ({
          tahun: k.tahun,
          bulan: k.bulan,
          periodeStr: k.periodeStr,
          beban: null,
          akumulasi: null,
          nilaiTercatat: null,
          keterangan: k.keterangan,
          isPosted: k.isPosted,
        })),
        fiskal: fiskalWithStatus.map((f) => ({
          tahun: f.tahun,
          bulan: f.bulan,
          periodeStr: f.periodeStr,
          beban: null,
          akumulasi: null,
          nilaiTercatat: null,
          keterangan: f.keterangan,
          isPosted: f.isPosted,
        })),
        komersialDisusutkanPenuh: schedule.komersialDisusutkanPenuh,
        fiskalDisusutkanPenuh: schedule.fiskalDisusutkanPenuh,
      };
    }

    return {
      assetId: asset.id,
      noAset: asset.noAset,
      nama: asset.nama,
      komersial: komersialWithStatus,
      fiskal: fiskalWithStatus,
      komersialDisusutkanPenuh: schedule.komersialDisusutkanPenuh,
      fiskalDisusutkanPenuh: schedule.fiskalDisusutkanPenuh,
    };
  }

  /**
   * Verifikasi ulang dan sinkronisasi denormalisasi saldo aset dari entri aktif
   */
  async verifyAndSyncAssetBalances(tenantId: string, assetId?: string) {
    const where: any = { tenantId };
    if (assetId) where.id = assetId;

    const assets = await this.prisma.fixedAsset.findMany({ where });

    let syncedCount = 0;
    for (const asset of assets) {
      const allKomersial = await this.prisma.assetDepreciationEntry.findMany({
        where: {
          assetId: asset.id,
          buku: DepreciationBook.KOMERSIAL,
          status: DepreciationEntryStatus.AKTIF,
        },
      });

      const allFiskal = await this.prisma.assetDepreciationEntry.findMany({
        where: {
          assetId: asset.id,
          buku: DepreciationBook.FISKAL,
          status: DepreciationEntryStatus.AKTIF,
        },
      });

      const totalAkumulasiKomersial = this.engine.round2(
        allKomersial.reduce((s, e) => s + Number(e.jumlah), 0),
      );
      const totalAkumulasiFiskal = this.engine.round2(
        allFiskal.reduce((s, e) => s + Number(e.jumlah), 0),
      );

      const newNilaiTercatat = this.engine.round2(
        Number(asset.hargaPerolehan) - totalAkumulasiKomersial,
      );
      const newNilaiSisaBukuFiskal = this.engine.round2(
        Number(asset.hargaPerolehan) - totalAkumulasiFiskal,
      );

      const isFullyDepreciated = newNilaiTercatat <= Number(asset.nilaiResidu || 0);

      await this.prisma.fixedAsset.update({
        where: { id: asset.id },
        data: {
          akumulasiKomersial: totalAkumulasiKomersial,
          akumulasiFiskal: totalAkumulasiFiskal,
          nilaiTercatat: newNilaiTercatat,
          nilaiSisaBukuFiskal: newNilaiSisaBukuFiskal,
          status: isFullyDepreciated
            ? FixedAssetStatus.DISUSUTKAN_PENUH
            : asset.status === FixedAssetStatus.DISUSUTKAN_PENUH
            ? FixedAssetStatus.AKTIF
            : asset.status,
        },
      });

      syncedCount += 1;
    }

    return {
      success: true,
      syncedCount,
    };
  }

  /**
   * Menjalankan evaluasi auto-depreciation run
   * Dipanggil saat pergantian periode atau pemicu terjadwal
   */
  async runAutoDepreciationJob(tenantId?: string) {
    this.logger.log('Menjalankan evaluasi auto-depreciation run...');

    const where: any = {
      fixedAssetEnabled: true,
      autoDepreciationRun: true,
    };
    if (tenantId) where.tenantId = tenantId;

    const autoSettings = await this.prisma.subledgerSetting.findMany({ where });

    for (const setting of autoSettings) {
      try {
        const lastOpenPeriod = await this.prisma.accountingPeriod.findFirst({
          where: {
            fiscalYear: { tenantId: setting.tenantId },
            status: PeriodStatus.OPEN,
          },
          include: {
            fiscalYear: true,
          },
          orderBy: { tanggal_selesai: 'asc' },
        });

        if (!lastOpenPeriod) continue;

        const periodName = this.formatPeriodName(lastOpenPeriod);

        // Cek apakah sudah pernah diposting
        const runExists = await this.prisma.assetDepreciationRun.findFirst({
          where: {
            tenantId: setting.tenantId,
            periodId: lastOpenPeriod.id,
            status: AssetDepreciationRunStatus.POSTED,
          },
        });

        if (!runExists) {
          this.logger.log(
            `Menjalankan auto-depreciation untuk tenant ${setting.tenantId} pada periode ${periodName}...`,
          );
          await this.post(setting.tenantId, lastOpenPeriod.id, 'SYSTEM-AUTO');
        }
      } catch (err: any) {
        this.logger.error(
          `Gagal menjalankan auto-depreciation untuk tenant ${setting.tenantId}: ${err.message}`,
          err.stack,
        );
      }
    }
  }
}
