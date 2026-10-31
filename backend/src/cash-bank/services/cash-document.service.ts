import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubledgerPostingService } from '../../subledger/subledger-posting.service';
import {
  DocumentNumberingService,
  SubledgerDocType,
} from '../../subledger/document-numbering.service';
import { CashBankCaptureService } from './cash-bank-capture.service';
import { CashBankAccountService } from './cash-bank-account.service';
import { CreateCashReceiptDto } from '../dto/cash-receipt.dto';
import { CreateCashDisbursementDto } from '../dto/cash-disbursement.dto';
import { CreateCashTransferDto } from '../dto/cash-transfer.dto';
import {
  CashDocStatus,
  CashTransferVariant,
  CashBankAccountType,
  PostingSetupKey,
} from '@prisma/client';

@Injectable()
export class CashDocumentService {
  private readonly logger = new Logger(CashDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPosting: SubledgerPostingService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly captureService: CashBankCaptureService,
    private readonly accountService: CashBankAccountService,
  ) {}

  // ==========================================
  // 1. PENERIMAAN KAS/BANK (CASH RECEIPT)
  // ==========================================

  async findAllReceipts(tenantId: string) {
    return this.prisma.cashReceipt.findMany({
      where: { tenantId },
      include: {
        cashBankAccount: { select: { id: true, kode: true, nama: true, mata_uang: true } },
        lines: {
          include: {
            akunLawan: { select: { id: true, kode_akun: true, nama_akun: true } },
          },
        },
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  async findReceiptById(tenantId: string, id: string) {
    const receipt = await this.prisma.cashReceipt.findFirst({
      where: { id, tenantId },
      include: {
        cashBankAccount: { include: { chartOfAccount: true } },
        lines: {
          include: {
            akunLawan: true,
          },
        },
      },
    });

    if (!receipt) throw new NotFoundException(`Penerimaan kas ID '${id}' tidak ditemukan`);
    return receipt;
  }

  async createReceiptDraft(tenantId: string, dto: CreateCashReceiptDto, userId?: string) {
    const account = await this.prisma.cashBankAccount.findFirst({
      where: { id: dto.cashBankAccountId, tenantId },
    });
    if (!account) throw new NotFoundException('Rekening kas/bank tidak ditemukan');

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Penerimaan kas harus memiliki minimal 1 baris akun lawan');
    }

    const total = dto.lines.reduce((acc, curr) => acc + Number(curr.jumlah), 0);
    const noDokumen = await this.docNumbering.generateNextNumber(
      tenantId,
      SubledgerDocType.CASH_RECEIPT,
      'CR',
      new Date(dto.tanggal).getFullYear(),
    );

    return this.prisma.cashReceipt.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        cashBankAccountId: dto.cashBankAccountId,
        mata_uang: dto.mata_uang || account.mata_uang,
        kurs: dto.kurs || 1.0,
        total,
        catatan: dto.catatan || null,
        externalRef: dto.externalRef || null,
        idempotencyKey: dto.idempotencyKey || null,
        status: CashDocStatus.DRAFT,
        createdBy: userId || null,
        lines: {
          create: dto.lines.map((l) => ({
            akunLawanId: l.akunLawanId,
            deskripsi: l.deskripsi,
            jumlah: Number(l.jumlah),
            dimensions: l.dimensions || null,
          })),
        },
      },
      include: {
        lines: true,
      },
    });
  }

  async postReceipt(tenantId: string, id: string) {
    const receipt = await this.findReceiptById(tenantId, id);
    if (receipt.status !== CashDocStatus.DRAFT) {
      throw new BadRequestException(`Hanya penerimaan kas berstatus DRAFT yang dapat diposting`);
    }

    // Persiapkan entri jurnal GL:
    // Debit: Akun Kas/Bank
    // Kredit: Akun Lawan per baris
    const entries: any[] = [];

    entries.push({
      kode_akun: receipt.cashBankAccount.chartOfAccount.kode_akun,
      tipe: 'DEBIT',
      jumlah: Number(receipt.total),
    });

    for (const line of receipt.lines) {
      entries.push({
        kode_akun: line.akunLawan.kode_akun,
        tipe: 'KREDIT',
        jumlah: Number(line.jumlah),
        dimensions: line.dimensions as any,
      });
    }

    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: receipt.tanggal.toISOString().slice(0, 10),
      deskripsi: receipt.catatan || `Penerimaan Kas/Bank ${receipt.noDokumen}`,
      sumber_aplikasi: 'SUBLEDGER-CASH',
      sourceDocType: 'CASH_RECEIPT',
      sourceDocId: receipt.id,
      no_voucher: receipt.noDokumen,
      mata_uang: receipt.mata_uang,
      entries,
    });

    // Tangkap langsung ke buku kas (idempoten)
    await this.captureService.captureJournal(journal.id);

    return this.prisma.cashReceipt.update({
      where: { id },
      data: {
        status: CashDocStatus.POSTED,
        journalId: journal.id,
        postedAt: new Date(),
      },
    });
  }

  async voidReceipt(tenantId: string, id: string, alasan?: string) {
    const receipt = await this.findReceiptById(tenantId, id);
    if (receipt.status !== CashDocStatus.POSTED || !receipt.journalId) {
      throw new BadRequestException('Hanya dokumen penerimaan POSTED yang dapat dibatalkan (void)');
    }

    // Validasi cleared
    await this.captureService.assertCanReverse(receipt.journalId);

    // Reversal journal GL
    const reversal = await this.subledgerPosting.reverseJournal(
      tenantId,
      receipt.journalId,
      undefined,
      alasan || `Pembatalan Penerimaan Kas ${receipt.noDokumen}`,
    );

    // Tangkap jurnal pembalik ke buku kas
    await this.captureService.captureJournal(reversal.id);

    return this.prisma.cashReceipt.update({
      where: { id },
      data: {
        status: CashDocStatus.VOID,
      },
    });
  }

  // ==========================================
  // 2. PENGELUARAN KAS & VOUCHER KAS KECIL
  // ==========================================

  async findAllDisbursements(tenantId: string, docVariant?: string) {
    const where: any = { tenantId };
    if (docVariant) where.docVariant = docVariant;

    return this.prisma.cashDisbursement.findMany({
      where,
      include: {
        cashBankAccount: { select: { id: true, kode: true, nama: true, mata_uang: true, jenis: true } },
        lines: {
          include: {
            akunLawan: { select: { id: true, kode_akun: true, nama_akun: true } },
          },
        },
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  async findDisbursementById(tenantId: string, id: string) {
    const disbursement = await this.prisma.cashDisbursement.findFirst({
      where: { id, tenantId },
      include: {
        cashBankAccount: { include: { chartOfAccount: true } },
        lines: {
          include: {
            akunLawan: true,
          },
        },
      },
    });

    if (!disbursement) throw new NotFoundException(`Pengeluaran kas ID '${id}' tidak ditemukan`);
    return disbursement;
  }

  async createDisbursementDraft(
    tenantId: string,
    dto: CreateCashDisbursementDto,
    userId?: string,
  ) {
    const account = await this.prisma.cashBankAccount.findFirst({
      where: { id: dto.cashBankAccountId, tenantId },
    });
    if (!account) throw new NotFoundException('Rekening kas/bank tidak ditemukan');

    const isPettyVoucher = dto.docVariant === 'PETTY_VOUCHER';
    if (isPettyVoucher && account.jenis !== CashBankAccountType.KAS_KECIL) {
      throw new BadRequestException('Voucher Kas Kecil hanya dapat diterbitkan pada rekening bertipe KAS_KECIL');
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Pengeluaran kas harus memiliki minimal 1 baris biaya/akun lawan');
    }

    const total = dto.lines.reduce((acc, curr) => acc + Number(curr.jumlah), 0);

    const docType = isPettyVoucher
      ? SubledgerDocType.PETTY_VOUCHER
      : SubledgerDocType.CASH_DISBURSEMENT;
    const prefix = isPettyVoucher ? 'PV' : 'CD';

    const noDokumen = await this.docNumbering.generateNextNumber(
      tenantId,
      docType,
      prefix,
      new Date(dto.tanggal).getFullYear(),
    );

    return this.prisma.cashDisbursement.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        cashBankAccountId: dto.cashBankAccountId,
        mata_uang: dto.mata_uang || account.mata_uang,
        kurs: dto.kurs || 1.0,
        total,
        catatan: dto.catatan || null,
        externalRef: dto.externalRef || null,
        idempotencyKey: dto.idempotencyKey || null,
        docVariant: dto.docVariant || 'STANDARD',
        status: CashDocStatus.DRAFT,
        createdBy: userId || null,
        lines: {
          create: dto.lines.map((l) => ({
            akunLawanId: l.akunLawanId,
            deskripsi: l.deskripsi,
            jumlah: Number(l.jumlah),
            dimensions: l.dimensions || null,
          })),
        },
      },
      include: {
        lines: true,
      },
    });
  }

  async postDisbursement(tenantId: string, id: string) {
    const disbursement = await this.findDisbursementById(tenantId, id);
    if (disbursement.status !== CashDocStatus.DRAFT) {
      throw new BadRequestException(`Hanya pengeluaran kas berstatus DRAFT yang dapat diposting`);
    }

    // Validasi plafon kas kecil bila varian PETTY_VOUCHER
    if (disbursement.docVariant === 'PETTY_VOUCHER') {
      const balance = await this.accountService.getBalance(disbursement.cashBankAccountId);
      const settings = await this.prisma.subledgerSetting.findUnique({ where: { tenantId } });
      const overLimitMode = settings?.pettyCashOverLimitMode || 'WARN';
      const plafon = Number(disbursement.cashBankAccount.plafonKasKecil || 0);

      if (balance.saldoAkhir < Number(disbursement.total) || (plafon > 0 && Number(disbursement.total) > plafon)) {
        if (overLimitMode === 'BLOCK') {
          throw new BadRequestException(
            `Pengeluaran voucher kas kecil (${disbursement.total}) melebihi saldo kas kecil yang tersedia (${balance.saldoAkhir}). Kebijakan sistem saat ini adalah Kunci Keras (BLOCK).`,
          );
        }
        this.logger.warn(`Peringatan kas kecil: voucher ${disbursement.noDokumen} melebihi saldo/plafon kas kecil.`);
      }
    }

    // Persiapkan entri jurnal GL:
    // Debit: Akun Lawan (Beban / Aset Lain) per baris
    // Kredit: Akun Kas/Bank
    const entries: any[] = [];

    for (const line of disbursement.lines) {
      entries.push({
        kode_akun: line.akunLawan.kode_akun,
        tipe: 'DEBIT',
        jumlah: Number(line.jumlah),
        dimensions: line.dimensions as any,
      });
    }

    entries.push({
      kode_akun: disbursement.cashBankAccount.chartOfAccount.kode_akun,
      tipe: 'KREDIT',
      jumlah: Number(disbursement.total),
    });

    const sourceDocType =
      disbursement.docVariant === 'PETTY_VOUCHER'
        ? 'PETTY_VOUCHER'
        : 'CASH_DISBURSEMENT';

    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: disbursement.tanggal.toISOString().slice(0, 10),
      deskripsi: disbursement.catatan || `Pengeluaran Kas/Bank ${disbursement.noDokumen}`,
      sumber_aplikasi: 'SUBLEDGER-CASH',
      sourceDocType,
      sourceDocId: disbursement.id,
      no_voucher: disbursement.noDokumen,
      mata_uang: disbursement.mata_uang,
      entries,
    });

    // Tangkap ke buku kas
    await this.captureService.captureJournal(journal.id);

    return this.prisma.cashDisbursement.update({
      where: { id },
      data: {
        status: CashDocStatus.POSTED,
        journalId: journal.id,
        postedAt: new Date(),
      },
    });
  }

  async voidDisbursement(tenantId: string, id: string, alasan?: string) {
    const disbursement = await this.findDisbursementById(tenantId, id);
    if (disbursement.status !== CashDocStatus.POSTED || !disbursement.journalId) {
      throw new BadRequestException('Hanya pengeluaran POSTED yang dapat dibatalkan (void)');
    }

    if (disbursement.replenishmentId) {
      throw new BadRequestException(
        'Voucher kas kecil ini sudah diganti melalui dokumen pengisian kas kecil (replenishment). Batalkan replenishment terlebih dahulu.',
      );
    }

    // Validasi cleared
    await this.captureService.assertCanReverse(disbursement.journalId);

    // Reversal journal GL
    const reversal = await this.subledgerPosting.reverseJournal(
      tenantId,
      disbursement.journalId,
      undefined,
      alasan || `Pembatalan Pengeluaran Kas ${disbursement.noDokumen}`,
    );

    // Tangkap jurnal pembalik ke buku kas
    await this.captureService.captureJournal(reversal.id);

    return this.prisma.cashDisbursement.update({
      where: { id },
      data: {
        status: CashDocStatus.VOID,
      },
    });
  }

  // ==========================================
  // 3. TRANSFER DANA & PENGISIAN KAS KECIL
  // ==========================================

  async findAllTransfers(tenantId: string, variant?: CashTransferVariant) {
    const where: any = { tenantId };
    if (variant) where.variant = variant;

    return this.prisma.cashTransfer.findMany({
      where,
      include: {
        dariAccount: { select: { id: true, kode: true, nama: true, mata_uang: true } },
        keAccount: { select: { id: true, kode: true, nama: true, mata_uang: true, jenis: true } },
        akunBiaya: { select: { id: true, kode_akun: true, nama_akun: true } },
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  async findTransferById(tenantId: string, id: string) {
    const transfer = await this.prisma.cashTransfer.findFirst({
      where: { id, tenantId },
      include: {
        dariAccount: { include: { chartOfAccount: true } },
        keAccount: { include: { chartOfAccount: true } },
        akunBiaya: true,
      },
    });

    if (!transfer) throw new NotFoundException(`Transfer dana ID '${id}' tidak ditemukan`);
    return transfer;
  }

  async createTransferDraft(
    tenantId: string,
    dto: CreateCashTransferDto,
    userId?: string,
  ) {
    if (dto.dariAccountId === dto.keAccountId) {
      throw new BadRequestException('Rekening asal dan rekening tujuan transfer tidak boleh sama');
    }

    const dariAccount = await this.prisma.cashBankAccount.findFirst({
      where: { id: dto.dariAccountId, tenantId },
    });
    const keAccount = await this.prisma.cashBankAccount.findFirst({
      where: { id: dto.keAccountId, tenantId },
    });

    if (!dariAccount || !keAccount) {
      throw new NotFoundException('Rekening asal atau rekening tujuan tidak ditemukan');
    }

    const isPengisianKasKecil = dto.variant === CashTransferVariant.PENGISIAN_KAS_KECIL;
    if (isPengisianKasKecil && keAccount.jenis !== CashBankAccountType.KAS_KECIL) {
      throw new BadRequestException('Pengisian kas kecil hanya diperbolehkan ke rekening tujuan bertipe KAS_KECIL');
    }

    // Akun biaya transfer default dari PostingSetup jika biaya ada tapi akun belum diisi
    let akunBiayaId = dto.akunBiayaId;
    if (dto.biayaTransfer && dto.biayaTransfer > 0 && !akunBiayaId) {
      const defaultFee = await this.prisma.postingSetup.findFirst({
        where: { tenantId, key: PostingSetupKey.BANK_CHARGE_EXPENSE },
      });
      akunBiayaId = defaultFee?.accountId || undefined;
    }

    const docType = isPengisianKasKecil
      ? SubledgerDocType.PETTY_REPLENISH
      : SubledgerDocType.CASH_TRANSFER;
    const prefix = isPengisianKasKecil ? 'PR' : 'CT';

    const noDokumen = await this.docNumbering.generateNextNumber(
      tenantId,
      docType,
      prefix,
      new Date(dto.tanggal).getFullYear(),
    );

    return this.prisma.cashTransfer.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        dariAccountId: dto.dariAccountId,
        keAccountId: dto.keAccountId,
        jumlahKeluar: Number(dto.jumlahKeluar),
        jumlahMasuk: Number(dto.jumlahMasuk),
        kurs: dto.kurs || 1.0,
        biayaTransfer: dto.biayaTransfer ? Number(dto.biayaTransfer) : null,
        akunBiayaId: akunBiayaId || null,
        variant: dto.variant || CashTransferVariant.TRANSFER,
        catatan: dto.catatan || null,
        externalRef: dto.externalRef || null,
        idempotencyKey: dto.idempotencyKey || null,
        status: CashDocStatus.DRAFT,
        createdBy: userId || null,
      },
    });
  }

  async postTransfer(tenantId: string, id: string) {
    const transfer = await this.findTransferById(tenantId, id);
    if (transfer.status !== CashDocStatus.DRAFT) {
      throw new BadRequestException('Hanya transfer dana berstatus DRAFT yang dapat diposting');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const baseCurrency = tenant?.mata_uang || 'IDR';

    // Persiapan entri GL:
    // Debit: Rekening Tujuan (jumlahMasuk)
    // Kredit: Rekening Asal (jumlahKeluar)
    // Debit: Biaya Administrasi Transfer (jika ada)
    // Selisih Kurs: Laba/Rugi Valas jika lintas mata uang
    const entries: any[] = [];

    // 1. Debit Rekening Tujuan
    entries.push({
      kode_akun: transfer.keAccount.chartOfAccount.kode_akun,
      tipe: 'DEBIT',
      jumlah: Number(transfer.jumlahMasuk),
    });

    // 2. Biaya Transfer (jika ada)
    const biaya = Number(transfer.biayaTransfer || 0);
    if (biaya > 0 && transfer.akunBiaya) {
      entries.push({
        kode_akun: transfer.akunBiaya.kode_akun,
        tipe: 'DEBIT',
        jumlah: biaya,
      });
    }

    // 3. Kredit Rekening Asal
    entries.push({
      kode_akun: transfer.dariAccount.chartOfAccount.kode_akun,
      tipe: 'KREDIT',
      jumlah: Number(transfer.jumlahKeluar) + (biaya > 0 && !transfer.akunBiaya ? biaya : 0),
    });

    // 4. Perhitungan Selisih Kurs bila lintas mata uang
    // Nilai fungsional dihitung pada JournalService berdasarkan kurs harian atau input dokumen.
    // Jika ada selisih balance debit & kredit akibat perbedaan kurs:
    const totalDebit = Number(transfer.jumlahMasuk) + biaya;
    const totalKredit = Number(transfer.jumlahKeluar);
    const fxDiff = totalDebit - totalKredit;

    if (Math.abs(fxDiff) > 0.001) {
      const fxSetup = await this.prisma.postingSetup.findFirst({
        where: { tenantId, key: PostingSetupKey.FX_GAIN_LOSS },
        include: { account: true },
      });

      if (fxSetup?.account) {
        if (fxDiff < 0) {
          // Debit lebih kecil dari kredit -> rugi selisih kurs (debit)
          entries.push({
            kode_akun: fxSetup.account.kode_akun,
            tipe: 'DEBIT',
            jumlah: Math.abs(fxDiff),
          });
        } else {
          // Kredit lebih kecil dari debit -> laba selisih kurs (kredit)
          entries.push({
            kode_akun: fxSetup.account.kode_akun,
            tipe: 'KREDIT',
            jumlah: Math.abs(fxDiff),
          });
        }
      }
    }

    const sourceDocType =
      transfer.variant === CashTransferVariant.PENGISIAN_KAS_KECIL
        ? 'PETTY_REPLENISH'
        : 'CASH_TRANSFER';

    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: transfer.tanggal.toISOString().slice(0, 10),
      deskripsi: transfer.catatan || `Transfer Dana ${transfer.noDokumen}`,
      sumber_aplikasi: 'SUBLEDGER-CASH',
      sourceDocType,
      sourceDocId: transfer.id,
      no_voucher: transfer.noDokumen,
      mata_uang: transfer.dariAccount.mata_uang,
      entries,
    });

    // Tangkap ke buku kas (akan menghasilkan 2 entri: KELUAR dari akun asal, MASUK ke akun tujuan)
    await this.captureService.captureJournal(journal.id);

    // Jika ini adalah pengisian kas kecil (PENGISIAN_KAS_KECIL), tandai voucher kas kecil yang diganti
    if (transfer.variant === CashTransferVariant.PENGISIAN_KAS_KECIL) {
      await this.prisma.cashDisbursement.updateMany({
        where: {
          tenantId,
          cashBankAccountId: transfer.keAccountId,
          docVariant: 'PETTY_VOUCHER',
          status: CashDocStatus.POSTED,
          replenishmentId: null,
          tanggal: { lte: transfer.tanggal },
        },
        data: {
          replenishmentId: transfer.id,
        },
      });
    }

    return this.prisma.cashTransfer.update({
      where: { id },
      data: {
        status: CashDocStatus.POSTED,
        journalId: journal.id,
        postedAt: new Date(),
      },
    });
  }

  async voidTransfer(tenantId: string, id: string, alasan?: string) {
    const transfer = await this.findTransferById(tenantId, id);
    if (transfer.status !== CashDocStatus.POSTED || !transfer.journalId) {
      throw new BadRequestException('Hanya transfer POSTED yang dapat dibatalkan (void)');
    }

    // Validasi cleared
    await this.captureService.assertCanReverse(transfer.journalId);

    // Reversal journal GL
    const reversal = await this.subledgerPosting.reverseJournal(
      tenantId,
      transfer.journalId,
      undefined,
      alasan || `Pembatalan Transfer Dana ${transfer.noDokumen}`,
    );

    // Tangkap jurnal pembalik ke buku kas
    await this.captureService.captureJournal(reversal.id);

    // Lepas reimbursement jika varian PENGISIAN_KAS_KECIL
    if (transfer.variant === CashTransferVariant.PENGISIAN_KAS_KECIL) {
      await this.prisma.cashDisbursement.updateMany({
        where: {
          replenishmentId: transfer.id,
        },
        data: {
          replenishmentId: null,
        },
      });
    }

    return this.prisma.cashTransfer.update({
      where: { id },
      data: {
        status: CashDocStatus.VOID,
      },
    });
  }

  /**
   * Mengambil saran nominal pengisian kas kecil (plafon - saldo berjalan) beserta daftar voucher yang belum diganti.
   */
  async getPettyCashReplenishmentSuggestion(tenantId: string, cashBankAccountId: string) {
    const account = await this.prisma.cashBankAccount.findFirst({
      where: { id: cashBankAccountId, tenantId },
    });
    if (!account) throw new NotFoundException('Rekening kas kecil tidak ditemukan');
    if (account.jenis !== CashBankAccountType.KAS_KECIL) {
      throw new BadRequestException('Rekening ini bukan bertipe KAS_KECIL');
    }

    const balance = await this.accountService.getBalance(cashBankAccountId);
    const plafon = Number(account.plafonKasKecil || 0);

    // Ambil daftar voucher yang belum diganti
    const unreimbursedVouchers = await this.prisma.cashDisbursement.findMany({
      where: {
        tenantId,
        cashBankAccountId,
        docVariant: 'PETTY_VOUCHER',
        status: CashDocStatus.POSTED,
        replenishmentId: null,
      },
      include: {
        lines: true,
      },
      orderBy: { tanggal: 'asc' },
    });

    const totalVouchers = unreimbursedVouchers.reduce((acc, v) => acc + Number(v.total), 0);
    // Saran pengisian: mengembalikan saldo ke plafon (plafon - saldo berjalan)
    const suggestedNominal = Math.max(0, plafon - balance.saldoAkhir);

    return {
      account,
      plafon,
      saldoSaatIni: balance.saldoAkhir,
      suggestedNominal,
      totalVouchers,
      vouchers: unreimbursedVouchers,
    };
  }
}

