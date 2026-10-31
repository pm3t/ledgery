import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ControlAccountType,
  JournalStatus,
  CashBankAccountType,
  CashBankEntryDirection,
  CashBankSourceType,
} from '@prisma/client';

/**
 * Service penangkap transaksi Kas & Bank (CashBankCaptureService).
 * Merupakan SATU-SATUNYA jalur resmi pembentukan buku kas/bank (CashBankEntry)
 * yang dipicu oleh hook posting jurnal GL (POSTED / APPROVED).
 */
@Injectable()
export class CashBankCaptureService {
  private readonly logger = new Logger(CashBankCaptureService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('journal.posted', { async: true })
  async handleJournalPosted(payload: { tenantId?: string; journalId: string }) {
    try {
      await this.captureJournal(payload.journalId);
    } catch (err: any) {
      this.logger.error(`Error capturing journal ${payload.journalId}: ${err.message}`);
    }
  }

  @OnEvent('journal.approved', { async: true })
  async handleJournalApproved(payload: { tenantId?: string; journalId: string }) {
    try {
      await this.captureJournal(payload.journalId);
    } catch (err: any) {
      this.logger.error(`Error capturing approved journal ${payload.journalId}: ${err.message}`);
    }
  }

  @OnEvent('subledger.cashBankEnabled', { async: true })
  async handleSubledgerCashBankEnabled(payload: { tenantId: string }) {
    try {
      await this.backfillHistoricalEntries(payload.tenantId);
    } catch (err: any) {
      this.logger.error(`Error backfilling for tenant ${payload.tenantId}: ${err.message}`);
    }
  }

  /**
   * Menangkap dan membuat CashBankEntry untuk semua baris jurnal yang mengenai akun kontrol CASH_BANK.
   * Dijalankan secara otomatis saat jurnal berstatus POSTED atau APPROVED.
   * Aman dari duplikasi (idempoten) berkat unique constraint pada journalEntryId.
   */
  async captureJournal(journalId: string, txPrisma?: any): Promise<number> {
    const db = txPrisma || this.prisma;

    const journal = await db.journal.findUnique({
      where: { id: journalId },
      include: {
        tenant: true,
        entries: {
          include: {
            chartOfAccount: true,
          },
        },
      },
    });

    if (!journal) {
      this.logger.warn(`Jurnal dengan ID '${journalId}' tidak ditemukan saat proses capture.`);
      return 0;
    }

    // Hanya jurnal dengan status POSTED atau APPROVED yang boleh masuk ke buku kas/bank
    if (
      journal.status !== JournalStatus.POSTED &&
      journal.status !== JournalStatus.APPROVED
    ) {
      return 0;
    }

    let capturedCount = 0;

    for (const entry of journal.entries) {
      // Hanya tangkap baris yang terhubung ke akun kontrol CASH_BANK
      if (entry.chartOfAccount.controlType !== ControlAccountType.CASH_BANK) {
        continue;
      }

      // 1. Cek idempotensi: apakah baris jurnal ini sudah pernah dicatat ke buku kas
      const existingEntry = await db.cashBankEntry.findUnique({
        where: { journalEntryId: entry.id },
      });

      if (existingEntry) {
        continue; // Idempoten: lewati jika sudah pernah ditangkap
      }

      // 2. Ambil atau buat otomatis rekening CashBankAccount untuk akun GL ini
      let account = await db.cashBankAccount.findFirst({
        where: {
          tenantId: journal.tenantId,
          chartOfAccountId: entry.chartOfAccountId,
        },
      });

      if (!account) {
        // Auto-create rekening jika belum terdaftar (dengan tanda 'lengkapi data bank')
        const autoKode = `CB-${entry.chartOfAccount.kode_akun.replace(/[^a-zA-Z0-9]/g, '')}`;
        account = await db.cashBankAccount.create({
          data: {
            tenantId: journal.tenantId,
            kode: autoKode,
            nama: entry.chartOfAccount.nama_akun,
            jenis: CashBankAccountType.BANK,
            chartOfAccountId: entry.chartOfAccountId,
            mata_uang: journal.mata_uang || journal.tenant.mata_uang || 'IDR',
            namaBank: 'Lengkapi data bank',
            noRekening: '-',
            namaPemilik: '-',
            isActive: true,
          },
        });
        this.logger.log(
          `Rekening kas/bank otomatis dibuat untuk akun GL ${entry.chartOfAccount.kode_akun} (${autoKode})`,
        );
      }

      // 3. Tentukan arah mutasi kas:
      // Akun Kas/Bank adalah Aset: Debit = Masuk (+), Kredit = Keluar (-)
      const arah =
        entry.tipe === 'DEBIT'
          ? CashBankEntryDirection.MASUK
          : CashBankEntryDirection.KELUAR;

      // 4. Turunkan sourceType dari sourceDocType jurnal
      const sourceType = this.resolveSourceType(journal.sourceDocType);

      // 5. Tentukan jumlah nominal (dalam mata uang rekening dan mata uang fungsional)
      const jumlahMataUangRekening = entry.jumlah_asli
        ? Number(entry.jumlah_asli)
        : Number(entry.jumlah);
      const jumlahFungsional = Number(entry.jumlah);

      // 6. Buat record CashBankEntry
      await db.cashBankEntry.create({
        data: {
          tenantId: journal.tenantId,
          cashBankAccountId: account.id,
          tanggal: journal.tanggal,
          arah,
          jumlah: jumlahMataUangRekening,
          jumlahFungsional,
          journalEntryId: entry.id,
          journalId: journal.id,
          sourceType,
          sourceDocId: journal.sourceDocId || null,
          keterangan: journal.deskripsi || `Mutasi kas dari jurnal ${journal.no_voucher}`,
        },
      });

      capturedCount++;
    }

    return capturedCount;
  }

  /**
   * Memvalidasi apakah jurnal dapat dibatalkan (void / reverse).
   * Menolak jika entri kas/bank terkait sudah direkonsiliasi (clearedAt !== null).
   */
  async assertCanReverse(originalJournalId: string, txPrisma?: any): Promise<void> {
    const db = txPrisma || this.prisma;

    const clearedEntries = await db.cashBankEntry.findMany({
      where: {
        journalId: originalJournalId,
        clearedAt: { not: null },
      },
    });

    if (clearedEntries.length > 0) {
      throw new BadRequestException(
        'Tidak dapat membatalkan / void jurnal: transaksi kas & bank pada dokumen ini sudah direkonsiliasi (cleared). Batalkan rekonsiliasi bank terlebih dahulu.',
      );
    }
  }

  /**
   * Migrasi & Backfill historis saat modul Kas & Bank pertama kali diaktifkan.
   * Menghasilkan CashBankAccount untuk setiap akun CASH_BANK dan mengaitkan CustomerReceipt / VendorPayment lama.
   */
  async backfillHistoricalEntries(tenantId: string): Promise<{
    accountsCreated: number;
    entriesCaptured: number;
  }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException(`Tenant ${tenantId} tidak ditemukan`);

    // 1. Ambil seluruh akun COA bertipe CASH_BANK
    const cashAccounts = await this.prisma.chartOfAccount.findMany({
      where: {
        tenantId,
        controlType: ControlAccountType.CASH_BANK,
      },
    });

    let accountsCreated = 0;

    for (const acc of cashAccounts) {
      const existing = await this.prisma.cashBankAccount.findFirst({
        where: { tenantId, chartOfAccountId: acc.id },
      });

      if (!existing) {
        const autoKode = `CB-${acc.kode_akun.replace(/[^a-zA-Z0-9]/g, '')}`;
        await this.prisma.cashBankAccount.create({
          data: {
            tenantId,
            kode: autoKode,
            nama: acc.nama_akun,
            jenis: CashBankAccountType.BANK,
            chartOfAccountId: acc.id,
            mata_uang: tenant.mata_uang,
            namaBank: 'Lengkapi data bank',
            noRekening: '-',
            namaPemilik: '-',
            isActive: true,
          },
        });
        accountsCreated++;
      }
    }

    // 2. Hubungkan CustomerReceipt & VendorPayment lama ke CashBankAccount
    const allCashBankAccounts = await this.prisma.cashBankAccount.findMany({
      where: { tenantId },
    });
    const coaToCbMap = new Map(allCashBankAccounts.map((cb) => [cb.chartOfAccountId, cb.id]));

    // Update CustomerReceipt lama yang belum punya cashBankAccountId
    const unlinkedReceipts = await this.prisma.customerReceipt.findMany({
      where: { tenantId, cashBankAccountId: null },
      select: { id: true, akunKasBankId: true },
    });
    for (const r of unlinkedReceipts) {
      const cbId = coaToCbMap.get(r.akunKasBankId);
      if (cbId) {
        await this.prisma.customerReceipt.update({
          where: { id: r.id },
          data: { cashBankAccountId: cbId },
        });
      }
    }

    // Update VendorPayment lama yang belum punya cashBankAccountId
    const unlinkedPayments = await this.prisma.vendorPayment.findMany({
      where: { tenantId, cashBankAccountId: null },
      select: { id: true, akunKasBankId: true },
    });
    for (const p of unlinkedPayments) {
      const cbId = coaToCbMap.get(p.akunKasBankId);
      if (cbId) {
        await this.prisma.vendorPayment.update({
          where: { id: p.id },
          data: { cashBankAccountId: cbId },
        });
      }
    }

    // 3. Tangkap seluruh jurnal POSTED historis secara idempoten
    const postedJournals = await this.prisma.journal.findMany({
      where: {
        tenantId,
        status: { in: [JournalStatus.POSTED, JournalStatus.APPROVED] },
      },
      select: { id: true },
      orderBy: { tanggal: 'asc' },
    });

    let entriesCaptured = 0;
    for (const j of postedJournals) {
      const count = await this.captureJournal(j.id);
      entriesCaptured += count;
    }

    return { accountsCreated, entriesCaptured };
  }

  /**
   * Helper pemetaan sourceType dari sourceDocType jurnal.
   */
  private resolveSourceType(sourceDocType?: string | null): CashBankSourceType {
    if (!sourceDocType) {
      return CashBankSourceType.JOURNAL_CAPTURE;
    }

    switch (sourceDocType) {
      case 'CASH_RECEIPT':
        return CashBankSourceType.CASH_RECEIPT;
      case 'CASH_DISBURSEMENT':
        return CashBankSourceType.CASH_DISBURSEMENT;
      case 'CASH_TRANSFER':
        return CashBankSourceType.CASH_TRANSFER;
      case 'PETTY_REPLENISH':
        return CashBankSourceType.PETTY_REPLENISH;
      case 'PETTY_VOUCHER':
        return CashBankSourceType.PETTY_VOUCHER;
      case 'CUSTOMER_RECEIPT':
        return CashBankSourceType.CUSTOMER_RECEIPT;
      case 'VENDOR_PAYMENT':
        return CashBankSourceType.VENDOR_PAYMENT;
      case 'OPENING':
        return CashBankSourceType.OPENING;
      default:
        return CashBankSourceType.JOURNAL_CAPTURE;
    }
  }
}
