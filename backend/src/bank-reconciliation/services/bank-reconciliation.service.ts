import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  CashBankEntryDirection,
  BankMatchStatus,
  BankReconStatus,
  BankImportNominalMode,
} from '@prisma/client';
import * as xlsx from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { SubledgerPostingService } from '../../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../../subledger/document-numbering.service';
import { CashDocumentService } from '../../cash-bank/services/cash-document.service';
import {
  BankAutoMatchService,
  StatementLineCandidate,
  BookEntryCandidate,
} from './bank-auto-match.service';
import {
  parseIndonesianNumber,
  parseFlexibleDate,
  generateDedupeHash,
} from '../utils/number-date-parser';
import {
  SaveBankImportTemplateDto,
  ImportStatementLinesDto,
  ManualMatchDto,
  BatchAcceptMatchesDto,
  CreateAdjustmentDocDto,
  CompleteReconciliationDto,
  ReopenReconciliationDto,
} from '../dto/bank-reconciliation.dto';

@Injectable()
export class BankReconciliationService {
  private readonly logger = new Logger(BankReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPosting: SubledgerPostingService,
    private readonly numbering: DocumentNumberingService,
    private readonly cashDocService: CashDocumentService,
    private readonly autoMatchService: BankAutoMatchService,
  ) {}

  // =========================================================================
  // 1. TEMPLATE IMPOR REKENING KORAN PER REKENING
  // =========================================================================

  async getTemplate(tenantId: string, cashBankAccountId: string) {
    const tpl = await this.prisma.bankImportTemplate.findUnique({
      where: {
        tenantId_cashBankAccountId: {
          tenantId,
          cashBankAccountId,
        },
      },
    });
    return tpl;
  }

  async saveTemplate(tenantId: string, dto: SaveBankImportTemplateDto) {
    return this.prisma.bankImportTemplate.upsert({
      where: {
        tenantId_cashBankAccountId: {
          tenantId,
          cashBankAccountId: dto.cashBankAccountId,
        },
      },
      create: {
        tenantId,
        cashBankAccountId: dto.cashBankAccountId,
        pemetaanKolom: dto.pemetaanKolom as any,
        formatTanggal: dto.formatTanggal,
        pemisahDesimal: dto.pemisahDesimal,
        pemisahRibuan: dto.pemisahRibuan,
        modeNominal: dto.modeNominal,
      },
      update: {
        pemetaanKolom: dto.pemetaanKolom as any,
        formatTanggal: dto.formatTanggal,
        pemisahDesimal: dto.pemisahDesimal,
        pemisahRibuan: dto.pemisahRibuan,
        modeNominal: dto.modeNominal,
      },
    });
  }

  // =========================================================================
  // 2. IMPOR REKENING KORAN (CSV / EXCEL) DENGAN DEDUPE HASH
  // =========================================================================

  async importStatementFile(
    tenantId: string,
    userId: string,
    cashBankAccountId: string,
    fileBuffer: Buffer,
    fileName: string,
    templateConfig?: {
      pemetaanKolom: any;
      formatTanggal?: string;
      pemisahDesimal?: string;
      pemisahRibuan?: string;
      modeNominal?: BankImportNominalMode;
    },
  ) {
    // Ambil template tersimpan jika tidak disediakan override
    let tpl = templateConfig;
    if (!tpl) {
      const savedTpl = await this.getTemplate(tenantId, cashBankAccountId);
      if (!savedTpl) {
        throw new BadRequestException(
          'Template konfigurasi kolom belum disimpan untuk rekening ini. Harap tentukan pemetaan kolom terlebih dahulu.',
        );
      }
      tpl = {
        pemetaanKolom: savedTpl.pemetaanKolom,
        formatTanggal: savedTpl.formatTanggal,
        pemisahDesimal: savedTpl.pemisahDesimal,
        pemisahRibuan: savedTpl.pemisahRibuan,
        modeNominal: savedTpl.modeNominal,
      };
    }

    const map = tpl.pemetaanKolom;
    const pemisahDesimal = tpl.pemisahDesimal || ',';
    const pemisahRibuan = tpl.pemisahRibuan || '.';
    const modeNominal = tpl.modeNominal || BankImportNominalMode.DEBIT_KREDIT_TERPISAH;

    // Baca file menggunakan xlsx
    const workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length === 0) {
      throw new BadRequestException('File kosong atau format tidak dapat dibaca.');
    }

    const startRow = map.startRow !== undefined ? Number(map.startRow) : 1;
    const parsedLines: Array<{
      tanggal: Date;
      keterangan: string;
      referensi?: string;
      debit: number;
      kredit: number;
      saldo?: number;
      dedupeHash: string;
    }> = [];

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const rawDate = row[map.tanggalCol];
      const rawKet = row[map.keteranganCol];
      if (!rawDate && !rawKet) continue; // Lewati baris kosong

      const tanggal = parseFlexibleDate(rawDate, tpl.formatTanggal);
      const keterangan = String(rawKet || '').trim();
      const referensi = map.referensiCol !== undefined ? String(row[map.referensiCol] || '').trim() : undefined;

      let debit = 0;
      let kredit = 0;

      if (modeNominal === BankImportNominalMode.DEBIT_KREDIT_TERPISAH) {
        if (map.debitCol !== undefined) {
          debit = Math.abs(parseIndonesianNumber(row[map.debitCol], pemisahDesimal, pemisahRibuan));
        }
        if (map.kreditCol !== undefined) {
          kredit = Math.abs(parseIndonesianNumber(row[map.kreditCol], pemisahDesimal, pemisahRibuan));
        }
      } else {
        // SATU_KOLOM_BERTANDA
        const val = parseIndonesianNumber(row[map.nominalCol], pemisahDesimal, pemisahRibuan);
        if (val < 0) {
          debit = Math.abs(val);
        } else {
          kredit = val;
        }
      }

      // Lewati jika nominal 0 dan keterangan kosong
      if (debit === 0 && kredit === 0 && !keterangan) continue;

      let saldo: number | undefined = undefined;
      if (map.saldoCol !== undefined && row[map.saldoCol] !== '') {
        saldo = parseIndonesianNumber(row[map.saldoCol], pemisahDesimal, pemisahRibuan);
      }

      const hash = generateDedupeHash(
        cashBankAccountId,
        tanggal,
        debit,
        kredit,
        keterangan,
        referensi,
        saldo,
      );

      parsedLines.push({
        tanggal,
        keterangan,
        referensi,
        debit,
        kredit,
        saldo,
        dedupeHash: hash,
      });
    }

    if (parsedLines.length === 0) {
      throw new BadRequestException('Tidak ada data mutasi yang valid ditemukan dalam file.');
    }

    // 2. Deteksi Duplikat lewat dedupeHash
    const hashes = parsedLines.map((l) => l.dedupeHash);
    const existing = await this.prisma.bankStatementLine.findMany({
      where: {
        cashBankAccountId,
        dedupeHash: { in: hashes },
      },
      select: { dedupeHash: true },
    });
    const existingHashSet = new Set(existing.map((e) => e.dedupeHash));

    const newLines = parsedLines.filter((l) => !existingHashSet.has(l.dedupeHash));
    const skippedCount = parsedLines.length - newLines.length;

    if (newLines.length === 0) {
      return {
        message: 'Seluruh baris transaksi dalam file sudah pernah diimpor sebelumnya (duplikat).',
        totalRows: parsedLines.length,
        importedCount: 0,
        skippedCount,
      };
    }

    // Tentukan periode awal dan akhir
    const sortedDates = [...newLines].sort((a, b) => a.tanggal.getTime() - b.tanggal.getTime());
    const periodeAwal = sortedDates[0].tanggal;
    const periodeAkhir = sortedDates[sortedDates.length - 1].tanggal;
    const saldoAwal = sortedDates[0].saldo !== undefined ? sortedDates[0].saldo : 0;
    const saldoAkhir = sortedDates[sortedDates.length - 1].saldo !== undefined ? sortedDates[sortedDates.length - 1].saldo : 0;

    // Simpan ke database dalam transaksi
    const result = await this.prisma.$transaction(async (tx) => {
      const stmtImport = await tx.bankStatementImport.create({
        data: {
          tenantId,
          cashBankAccountId,
          namaFile: fileName,
          periodeAwal,
          periodeAkhir,
          saldoAwal,
          saldoAkhir,
          importedBy: userId,
        },
      });

      await tx.bankStatementLine.createMany({
        data: newLines.map((l) => ({
          importId: stmtImport.id,
          tenantId,
          cashBankAccountId,
          tanggal: l.tanggal,
          keterangan: l.keterangan,
          referensi: l.referensi || null,
          debit: l.debit,
          kredit: l.kredit,
          saldo: l.saldo !== undefined ? l.saldo : null,
          dedupeHash: l.dedupeHash,
          matchStatus: BankMatchStatus.UNMATCHED,
        })),
      });

      return stmtImport;
    });

    return {
      importId: result.id,
      namaFile: fileName,
      totalRows: parsedLines.length,
      importedCount: newLines.length,
      skippedCount,
      periodeAwal,
      periodeAkhir,
      saldoAwal,
      saldoAkhir,
    };
  }

  // =========================================================================
  // 3. AMBIL DATA UNTUK PENCARIAN & DUA PANEL REKONSILIASI
  // =========================================================================

  async getStatementLines(
    tenantId: string,
    cashBankAccountId: string,
    filter?: {
      matchStatus?: BankMatchStatus;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: Prisma.BankStatementLineWhereInput = {
      tenantId,
      cashBankAccountId,
    };

    if (filter?.matchStatus) {
      where.matchStatus = filter.matchStatus;
    }
    if (filter?.startDate || filter?.endDate) {
      where.tanggal = {};
      if (filter.startDate) {
        where.tanggal.gte = new Date(`${filter.startDate}T00:00:00.000Z`);
      }
      if (filter.endDate) {
        where.tanggal.lte = new Date(`${filter.endDate}T23:59:59.999Z`);
      }
    }

    return this.prisma.bankStatementLine.findMany({
      where,
      include: {
        matches: {
          include: {
            cashBankEntry: true,
          },
        },
      },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getBookEntriesForRecon(
    tenantId: string,
    cashBankAccountId: string,
    tanggalAkhir?: string,
  ) {
    const where: Prisma.CashBankEntryWhereInput = {
      tenantId,
      cashBankAccountId,
      clearedAt: null, // Hanya entri yang belum di-clear
    };

    if (tanggalAkhir) {
      where.tanggal = {
        lte: new Date(`${tanggalAkhir}T23:59:59.999Z`),
      };
    }

    return this.prisma.cashBankEntry.findMany({
      where,
      include: {
        matches: {
          include: {
            statementLine: true,
          },
        },
      },
      orderBy: [{ tanggal: 'asc' }, { id: 'asc' }],
    });
  }

  // =========================================================================
  // 4. SARAN PENCOCOKAN OTOMATIS & MASS ACCEPT
  // =========================================================================

  async getAutoMatchRecommendations(tenantId: string, cashBankAccountId: string) {
    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });
    const autoMatchDays = setting?.bankReconAutoMatchDays || 3;

    // Ambil baris statement yang UNMATCHED
    const stmtLines = await this.prisma.bankStatementLine.findMany({
      where: {
        tenantId,
        cashBankAccountId,
        matchStatus: BankMatchStatus.UNMATCHED,
      },
      orderBy: { tanggal: 'asc' },
    });

    // Ambil entri buku kas yang belum cleared dan belum dicocokkan
    const bookEntries = await this.prisma.cashBankEntry.findMany({
      where: {
        tenantId,
        cashBankAccountId,
        clearedAt: null,
        matches: { none: {} },
      },
      orderBy: { tanggal: 'asc' },
    });

    const stmtCandidates: StatementLineCandidate[] = stmtLines.map((s) => ({
      id: s.id,
      tanggal: s.tanggal,
      keterangan: s.keterangan,
      referensi: s.referensi,
      debit: Number(s.debit),
      kredit: Number(s.kredit),
    }));

    const bookCandidates: BookEntryCandidate[] = bookEntries.map((b) => ({
      id: b.id,
      tanggal: b.tanggal,
      arah: b.arah,
      jumlah: Number(b.jumlah),
      keterangan: b.keterangan,
      sourceType: b.sourceType,
      sourceDocId: b.sourceDocId,
    }));

    const evaluation = this.autoMatchService.evaluateMatches(
      stmtCandidates,
      bookCandidates,
      autoMatchDays,
    );

    // Sertakan detail entri buku untuk kemudahan UI
    const bookMap = new Map(bookEntries.map((b) => [b.id, b]));
    const stmtMap = new Map(stmtLines.map((s) => [s.id, s]));

    return evaluation.map((ev) => ({
      ...ev,
      statementLine: stmtMap.get(ev.statementLineId),
      matchedEntries: ev.matchedEntryIds.map((id) => bookMap.get(id)),
    }));
  }

  async batchAcceptMatches(
    tenantId: string,
    userId: string,
    dto: BatchAcceptMatchesDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      let acceptedCount = 0;

      for (const item of dto.matches) {
        const stmt = await tx.bankStatementLine.findFirst({
          where: { id: item.statementLineId, tenantId, matchStatus: BankMatchStatus.UNMATCHED },
        });
        if (!stmt) continue;

        const stmtAmount = Number(stmt.debit) > 0 ? Number(stmt.debit) : Number(stmt.kredit);

        for (const entryId of item.cashBankEntryIds) {
          const entry = await tx.cashBankEntry.findFirst({
            where: { id: entryId, tenantId, clearedAt: null },
          });
          if (!entry) continue;

          await tx.bankMatch.create({
            data: {
              statementLineId: stmt.id,
              cashBankEntryId: entry.id,
              jumlahAlokasi: entry.jumlah,
            },
          });
        }

        await tx.bankStatementLine.update({
          where: { id: stmt.id },
          data: { matchStatus: BankMatchStatus.MATCHED },
        });

        acceptedCount++;
      }

      return {
        message: `Berhasil menerima ${acceptedCount} pencocokan otomatis.`,
        acceptedCount,
      };
    });
  }

  // =========================================================================
  // 5. PENCOCOKAN MANUAL, UNMATCH, & ABAIKAN (IGNORE)
  // =========================================================================

  async manualMatch(tenantId: string, userId: string, dto: ManualMatchDto) {
    return this.prisma.$transaction(async (tx) => {
      const stmt = await tx.bankStatementLine.findFirst({
        where: { id: dto.statementLineId, tenantId },
      });
      if (!stmt) {
        throw new NotFoundException('Baris rekening koran tidak ditemukan.');
      }
      if (stmt.matchStatus === BankMatchStatus.MATCHED || stmt.matchStatus === BankMatchStatus.ADJUSTED) {
        throw new BadRequestException('Baris rekening koran sudah dicocokkan sebelumnya.');
      }

      const stmtAmount = Number(stmt.debit) > 0 ? Number(stmt.debit) : Number(stmt.kredit);
      const totalAllocation = dto.allocations.reduce((sum, a) => sum + Number(a.jumlahAlokasi), 0);

      // Validasi selisih alokasi
      if (Math.abs(totalAllocation - stmtAmount) > 0.01) {
        throw new BadRequestException(
          `Total alokasi (Rp ${totalAllocation.toLocaleString('id-ID')}) tidak sesuai dengan nominal baris rekening koran (Rp ${stmtAmount.toLocaleString('id-ID')}).`,
        );
      }

      for (const alloc of dto.allocations) {
        const entry = await tx.cashBankEntry.findFirst({
          where: { id: alloc.cashBankEntryId, tenantId, clearedAt: null },
        });
        if (!entry) {
          throw new BadRequestException(`Entri buku kas ${alloc.cashBankEntryId} tidak valid atau sudah cleared.`);
        }

        await tx.bankMatch.create({
          data: {
            statementLineId: stmt.id,
            cashBankEntryId: entry.id,
            jumlahAlokasi: alloc.jumlahAlokasi,
          },
        });
      }

      await tx.bankStatementLine.update({
        where: { id: stmt.id },
        data: { matchStatus: BankMatchStatus.MATCHED },
      });

      return {
        message: 'Pencocokan manual berhasil disimpan.',
        statementLineId: stmt.id,
      };
    });
  }

  async unmatch(tenantId: string, statementLineId: string) {
    return this.prisma.$transaction(async (tx) => {
      const stmt = await tx.bankStatementLine.findFirst({
        where: { id: statementLineId, tenantId },
      });
      if (!stmt) {
        throw new NotFoundException('Baris rekening koran tidak ditemukan.');
      }

      // Hapus BankMatch
      await tx.bankMatch.deleteMany({
        where: { statementLineId },
      });

      await tx.bankStatementLine.update({
        where: { id: statementLineId },
        data: {
          matchStatus: BankMatchStatus.UNMATCHED,
          ignoreReason: null,
        },
      });

      return {
        message: 'Pencocokan berhasil dibatalkan.',
        statementLineId,
      };
    });
  }

  async ignoreStatementLine(tenantId: string, statementLineId: string, reason: string) {
    const stmt = await this.prisma.bankStatementLine.findFirst({
      where: { id: statementLineId, tenantId },
    });
    if (!stmt) {
      throw new NotFoundException('Baris rekening koran tidak ditemukan.');
    }

    return this.prisma.bankStatementLine.update({
      where: { id: statementLineId },
      data: {
        matchStatus: BankMatchStatus.IGNORED,
        ignoreReason: reason,
      },
    });
  }

  async unignoreStatementLine(tenantId: string, statementLineId: string) {
    return this.prisma.bankStatementLine.update({
      where: { id: statementLineId },
      data: {
        matchStatus: BankMatchStatus.UNMATCHED,
        ignoreReason: null,
      },
    });
  }

  // =========================================================================
  // 6. BUAT DOKUMEN KAS DARI BARIS REKENING KORAN (ADJUSTMENT)
  // =========================================================================

  async createAdjustmentDoc(
    tenantId: string,
    userId: string,
    dto: CreateAdjustmentDocDto,
  ) {
    const stmt = await this.prisma.bankStatementLine.findFirst({
      where: { id: dto.statementLineId, tenantId },
      include: { cashBankAccount: true },
    });
    if (!stmt) {
      throw new NotFoundException('Baris rekening koran tidak ditemukan.');
    }
    if (stmt.matchStatus !== BankMatchStatus.UNMATCHED) {
      throw new BadRequestException('Baris rekening koran ini sudah tidak berstatus UNMATCHED.');
    }

    const isDebit = Number(stmt.debit) > 0;
    const nominal = isDebit ? Number(stmt.debit) : Number(stmt.kredit);
    const tanggalStr = stmt.tanggal.toISOString().slice(0, 10);
    const keterangan = dto.keterangan || stmt.keterangan || (isDebit ? 'Biaya Administrasi Bank' : 'Pendapatan Bunga Bank');

    // Jika DEBIT (uang keluar): buat CashDisbursement
    // Jika KREDIT (uang masuk): buat CashReceipt
    let docId = '';
    if (isDebit) {
      const disbursement = await this.cashDocService.createDisbursementDraft(
        tenantId,
        {
          cashBankAccountId: stmt.cashBankAccountId,
          tanggal: tanggalStr,
          catatan: `Penyesuaian Rekonsiliasi Bank: ${keterangan}`,
          lines: [
            {
              akunLawanId: dto.akunLawanId,
              deskripsi: keterangan,
              jumlah: nominal,
            },
          ],
        },
        userId,
      );
      // Langsung posting
      await this.cashDocService.postDisbursement(tenantId, disbursement.id);
      docId = disbursement.id;
    } else {
      const receipt = await this.cashDocService.createReceiptDraft(
        tenantId,
        {
          cashBankAccountId: stmt.cashBankAccountId,
          tanggal: tanggalStr,
          catatan: `Penyesuaian Rekonsiliasi Bank: ${keterangan}`,
          lines: [
            {
              akunLawanId: dto.akunLawanId,
              deskripsi: keterangan,
              jumlah: nominal,
            },
          ],
        },
        userId,
      );
      // Langsung posting
      await this.cashDocService.postReceipt(tenantId, receipt.id);
      docId = receipt.id;
    }

    // Temukan CashBankEntry yang terbentuk dari hook posting dokumen di atas
    const createdEntry = await this.prisma.cashBankEntry.findFirst({
      where: {
        tenantId,
        cashBankAccountId: stmt.cashBankAccountId,
        sourceDocId: docId,
      },
    });

    if (createdEntry) {
      await this.prisma.bankMatch.create({
        data: {
          statementLineId: stmt.id,
          cashBankEntryId: createdEntry.id,
          jumlahAlokasi: nominal,
        },
      });

      await this.prisma.bankStatementLine.update({
        where: { id: stmt.id },
        data: { matchStatus: BankMatchStatus.ADJUSTED },
      });
    }

    return {
      message: 'Dokumen penyesuaian kas berhasil dibuat, diposting, dan dicocokkan otomatis.',
      statementLineId: stmt.id,
      docId,
      cashBankEntryId: createdEntry?.id,
    };
  }

  // =========================================================================
  // 7. PERHITUNGAN REKONSILIASI BANK (RUMUS & ITEM BEREDAR)
  // =========================================================================

  async calculateReconciliationSummary(
    tenantId: string,
    cashBankAccountId: string,
    tanggalAkhirStr: string,
    inputSaldoRekeningKoran?: number,
  ) {
    const tanggalAkhir = new Date(`${tanggalAkhirStr}T23:59:59.999Z`);

    // 1. Hitung Saldo Buku Kas/Bank per tanggal akhir (semua entri kumulatif)
    const bookEntries = await this.prisma.cashBankEntry.findMany({
      where: {
        tenantId,
        cashBankAccountId,
        tanggal: { lte: tanggalAkhir },
      },
      select: { arah: true, jumlah: true, clearedAt: true, id: true, tanggal: true, keterangan: true },
    });

    let saldoBuku = 0;
    for (const e of bookEntries) {
      const amt = Number(e.jumlah);
      saldoBuku += e.arah === CashBankEntryDirection.MASUK ? amt : -amt;
    }

    // 2. Ambil entri buku belum cocok per tanggal akhir (Item Beredar)
    // a. MASUK belum cocok = Setoran dalam perjalanan (Deposits in transit)
    // b. KELUAR belum cocok = Cek/Transfer belum dicairkan (Outstanding checks)
    const unmatchedBookEntries = await this.prisma.cashBankEntry.findMany({
      where: {
        tenantId,
        cashBankAccountId,
        tanggal: { lte: tanggalAkhir },
        clearedAt: null,
        matches: { none: {} },
      },
      orderBy: { tanggal: 'asc' },
    });

    const setoranDalamPerjalanan = unmatchedBookEntries.filter(
      (e) => e.arah === CashBankEntryDirection.MASUK,
    );
    const cekBelumCair = unmatchedBookEntries.filter(
      (e) => e.arah === CashBankEntryDirection.KELUAR,
    );

    const totalSetoranDalamPerjalanan = setoranDalamPerjalanan.reduce(
      (sum, e) => sum + Number(e.jumlah),
      0,
    );
    const totalCekBelumCair = cekBelumCair.reduce(
      (sum, e) => sum + Number(e.jumlah),
      0,
    );

    // 3. Saldo Rekening Koran (dari input atau dari import terakhir per tanggal akhir)
    let saldoRekeningKoran = inputSaldoRekeningKoran !== undefined ? inputSaldoRekeningKoran : 0;
    if (inputSaldoRekeningKoran === undefined) {
      const latestImport = await this.prisma.bankStatementImport.findFirst({
        where: {
          tenantId,
          cashBankAccountId,
          periodeAkhir: { lte: tanggalAkhir },
        },
        orderBy: { periodeAkhir: 'desc' },
      });
      if (latestImport) {
        saldoRekeningKoran = Number(latestImport.saldoAkhir);
      }
    }

    // 4. Hitung Rumus:
    // saldoBankDisesuaikan = saldoRekeningKoran + (setoran dalam perjalanan) - (cek belum cair)
    // selisih = saldoBuku - saldoBankDisesuaikan
    const saldoBankDisesuaikan =
      saldoRekeningKoran + totalSetoranDalamPerjalanan - totalCekBelumCair;
    const selisih = Number((saldoBuku - saldoBankDisesuaikan).toFixed(4));

    // 5. Cek baris rekening koran UNMATCHED per tanggal akhir
    const unmatchedStmtCount = await this.prisma.bankStatementLine.count({
      where: {
        tenantId,
        cashBankAccountId,
        tanggal: { lte: tanggalAkhir },
        matchStatus: BankMatchStatus.UNMATCHED,
      },
    });

    const canComplete = Math.abs(selisih) < 0.0001 && unmatchedStmtCount === 0;

    return {
      tanggalAkhir: tanggalAkhirStr,
      saldoRekeningKoran,
      saldoBuku,
      itemBeredar: {
        setoranDalamPerjalanan: {
          total: totalSetoranDalamPerjalanan,
          items: setoranDalamPerjalanan,
        },
        cekBelumCair: {
          total: totalCekBelumCair,
          items: cekBelumCair,
        },
      },
      saldoBankDisesuaikan,
      selisih,
      unmatchedStmtCount,
      canComplete,
    };
  }

  // =========================================================================
  // 8. PENYELESAIAN (COMPLETE) & BUKA KEMBALI (REOPEN) REKONSILIASI
  // =========================================================================

  async completeReconciliation(
    tenantId: string,
    userId: string,
    dto: CompleteReconciliationDto,
  ) {
    const summary = await this.calculateReconciliationSummary(
      tenantId,
      dto.cashBankAccountId,
      dto.tanggalAkhir,
      dto.saldoRekeningKoran,
    );

    // Validasi 1: Selisih harus 0
    if (Math.abs(summary.selisih) > 0.0001) {
      throw new BadRequestException(
        `Rekonsiliasi tidak dapat diselesaikan: masih terdapat selisih sebesar Rp ${Math.abs(
          summary.selisih,
        ).toLocaleString('id-ID')}. Saldo buku dan saldo bank disesuaikan harus seimbang (selisih = 0).`,
      );
    }

    // Validasi 2: Tidak boleh ada baris rekening koran UNMATCHED
    if (summary.unmatchedStmtCount > 0) {
      throw new BadRequestException(
        `Rekonsiliasi tidak dapat diselesaikan: masih terdapat ${summary.unmatchedStmtCount} baris rekening koran yang belum dicocokkan (UNMATCHED). Setiap baris harus MATCHED, ADJUSTED, atau IGNORED.`,
      );
    }

    const tanggalAkhirDate = new Date(`${dto.tanggalAkhir}T23:59:59.999Z`);

    return this.prisma.$transaction(async (tx) => {
      // 1. Buat BankReconciliation SELESAI
      const recon = await tx.bankReconciliation.create({
        data: {
          tenantId,
          cashBankAccountId: dto.cashBankAccountId,
          tanggalAkhir: tanggalAkhirDate,
          saldoRekeningKoran: dto.saldoRekeningKoran,
          saldoBuku: summary.saldoBuku,
          selisih: 0,
          status: BankReconStatus.SELESAI,
          completedBy: userId,
          completedAt: new Date(),
        },
      });

      // 2. Ambil semua match aktif pada rekening ini yang belum ditautkan ke recon
      const activeMatches = await tx.bankMatch.findMany({
        where: {
          statementLine: {
            tenantId,
            cashBankAccountId: dto.cashBankAccountId,
            tanggal: { lte: tanggalAkhirDate },
          },
          reconciliationId: null,
        },
        include: { cashBankEntry: true },
      });

      const matchedEntryIds = Array.from(new Set(activeMatches.map((m) => m.cashBankEntryId)));

      // Update BankMatch dengan reconciliationId
      await tx.bankMatch.updateMany({
        where: {
          id: { in: activeMatches.map((m) => m.id) },
        },
        data: { reconciliationId: recon.id },
      });

      // 3. Tandai clearedAt dan reconciliationId pada CashBankEntry terkait
      if (matchedEntryIds.length > 0) {
        await tx.cashBankEntry.updateMany({
          where: {
            id: { in: matchedEntryIds },
          },
          data: {
            clearedAt: new Date(),
            reconciliationId: recon.id,
          },
        });
      }

      return {
        message: 'Rekonsiliasi bank berhasil diselesaikan.',
        reconciliationId: recon.id,
        clearedEntriesCount: matchedEntryIds.length,
      };
    });
  }

  async reopenReconciliation(
    tenantId: string,
    userId: string,
    reconciliationId: string,
    dto: ReopenReconciliationDto,
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id: reconciliationId, tenantId },
    });
    if (!recon) {
      throw new NotFoundException('Data rekonsiliasi bank tidak ditemukan.');
    }
    if (recon.status !== BankReconStatus.SELESAI) {
      throw new BadRequestException('Hanya rekonsiliasi berstatus SELESAI yang dapat dibuka kembali.');
    }

    // Aturan audit: Hanya rekonsiliasi TERBARU per rekening yang boleh dibuka kembali
    const newerRecon = await this.prisma.bankReconciliation.findFirst({
      where: {
        tenantId,
        cashBankAccountId: recon.cashBankAccountId,
        status: BankReconStatus.SELESAI,
        tanggalAkhir: { gt: recon.tanggalAkhir },
      },
    });

    if (newerRecon) {
      throw new BadRequestException(
        'Hanya rekonsiliasi bank paling akhir (terbaru) yang dapat dibuka kembali. Terdapat rekonsiliasi yang lebih baru pada rekening ini.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Hapus penanda cleared pada CashBankEntry
      await tx.cashBankEntry.updateMany({
        where: {
          reconciliationId: recon.id,
        },
        data: {
          clearedAt: null,
          reconciliationId: null,
        },
      });

      // 2. Putuskan tautan reconciliationId pada BankMatch
      await tx.bankMatch.updateMany({
        where: {
          reconciliationId: recon.id,
        },
        data: {
          reconciliationId: null,
        },
      });

      // 3. Ubah status menjadi DIBUKA_KEMBALI
      const updated = await tx.bankReconciliation.update({
        where: { id: recon.id },
        data: {
          status: BankReconStatus.DIBUKA_KEMBALI,
          reopenedBy: userId,
          reopenedAt: new Date(),
          reopenReason: dto.reason,
        },
      });

      return {
        message: 'Rekonsiliasi bank berhasil dibuka kembali. Penanda cleared telah dicabut.',
        reconciliationId: updated.id,
      };
    });
  }

  // =========================================================================
  // 9. RIWAYAT & DETAIL REKONSILIASI
  // =========================================================================

  async getReconciliationHistory(tenantId: string, cashBankAccountId?: string) {
    const where: Prisma.BankReconciliationWhereInput = { tenantId };
    if (cashBankAccountId) {
      where.cashBankAccountId = cashBankAccountId;
    }

    return this.prisma.bankReconciliation.findMany({
      where,
      include: {
        cashBankAccount: {
          select: { kode: true, nama: true, namaBank: true, noRekening: true },
        },
      },
      orderBy: { tanggalAkhir: 'desc' },
    });
  }

  async getReconciliationDetail(tenantId: string, reconciliationId: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id: reconciliationId, tenantId },
      include: {
        cashBankAccount: true,
        matches: {
          include: {
            statementLine: true,
            cashBankEntry: true,
          },
        },
      },
    });
    if (!recon) {
      throw new NotFoundException('Data rekonsiliasi bank tidak ditemukan.');
    }
    return recon;
  }
}
