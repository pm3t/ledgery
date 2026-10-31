import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubledgerPostingService } from '../../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../../subledger/document-numbering.service';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import { InventoryStockService } from './inventory-stock.service';
import { CreateStockReceiptOtherDto } from '../dto/stock-receipt-other.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class StockReceiptOtherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly docNumberingService: DocumentNumberingService,
    private readonly periodService: AccountingPeriodService,
    private readonly stockService: InventoryStockService,
  ) {}

  async findAll(tenantId: string, params?: { warehouseId?: string; status?: string }) {
    const where: any = { tenantId };
    if (params?.warehouseId) where.warehouseId = params.warehouseId;
    if (params?.status) where.status = params.status;

    return this.prisma.stockReceiptOther.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      include: {
        warehouse: true,
        akunLawan: true,
        journal: true,
        lines: {
          include: { item: true },
        },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const receipt = await this.prisma.stockReceiptOther.findFirst({
      where: { id, tenantId },
      include: {
        warehouse: true,
        akunLawan: true,
        journal: true,
        lines: {
          include: { item: true },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Penerimaan lainnya ID "${id}" tidak ditemukan.`);
    }

    return receipt;
  }

  async create(tenantId: string, dto: CreateStockReceiptOtherDto, user?: any) {
    await this.stockService.ensureInventoryEnabled(tenantId);

    // Cek idempotency jika ada
    if (dto.idempotencyKey) {
      const existing = await this.prisma.stockReceiptOther.findUnique({
        where: {
          tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey },
        },
        include: { lines: { include: { item: true } } },
      });
      if (existing) return existing;
    }

    const noDokumen = await this.docNumberingService.generateNextNumber(
      tenantId,
      'RCV_OTHER',
      'RCV-OTH',
    );

    let totalNilai = 0;
    const linesData = dto.lines.map((l) => {
      const lineTotal = Math.round(Number(l.qty) * Number(l.biayaSatuan) * 100) / 100;
      totalNilai += lineTotal;
      return {
        itemId: l.itemId,
        qty: new Prisma.Decimal(l.qty),
        biayaSatuan: new Prisma.Decimal(l.biayaSatuan),
        totalNilai: new Prisma.Decimal(lineTotal),
        catatan: l.catatan || null,
      };
    });

    return this.prisma.stockReceiptOther.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        warehouseId: dto.warehouseId,
        akunLawanId: dto.akunLawanId,
        status: 'DRAFT',
        totalNilai: new Prisma.Decimal(totalNilai),
        catatan: dto.catatan || null,
        externalRef: dto.externalRef || null,
        idempotencyKey: dto.idempotencyKey || null,
        createdBy: user?.nama || user?.email || 'SYSTEM',
        lines: {
          create: linesData,
        },
      },
      include: {
        lines: { include: { item: true } },
        warehouse: true,
        akunLawan: true,
      },
    });
  }

  async post(tenantId: string, id: string, user?: any) {
    const receipt = await this.findById(tenantId, id);

    if (receipt.status !== 'DRAFT') {
      throw new BadRequestException(
        `Dokumen penerimaan lainnya berstatus ${receipt.status}, hanya DRAFT yang dapat diposting.`,
      );
    }

    await this.periodService.validateJournalDate(tenantId, new Date(receipt.tanggal));

    // 1. Eksekusi pergerakan stok untuk setiap baris
    for (const line of receipt.lines) {
      await this.stockService.executeReceipt(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: receipt.warehouseId,
        qty: Number(line.qty),
        nilaiMasuk: Number(line.totalNilai),
        tanggal: new Date(receipt.tanggal),
        sourceDocType: 'STOCK_RECEIPT_OTHER',
        sourceDocId: receipt.id,
        tipeMovement: 'RECEIPT_OTHER',
        biayaSatuanKhusus: Number(line.biayaSatuan),
        createdBy: user?.nama || 'SYSTEM',
      });
    }

    // 2. Susun dan posting jurnal GL
    const invSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: 'INVENTORY' },
      include: { account: true },
    });
    if (!invSetup?.account) {
      throw new BadRequestException(
        'Akun kontrol INVENTORY belum dipetakan di Posting Setup Subledger.',
      );
    }
    const defaultInvAccount = invSetup.account;

    const entries: any[] = [];
    let totalDebitPersediaan = 0;

    for (const line of receipt.lines) {
      const lineTotal = Number(line.totalNilai);
      totalDebitPersediaan += lineTotal;

      let accountCode = defaultInvAccount.kode_akun;
      if (line.item?.akunPersediaanId) {
        const itemAcc = await this.prisma.chartOfAccount.findUnique({
          where: { id: line.item.akunPersediaanId },
        });
        if (itemAcc) accountCode = itemAcc.kode_akun;
      }

      entries.push({
        kode_akun: accountCode,
        tipe: 'DEBIT' as const,
        jumlah: lineTotal,
      });
    }

    // Kredit Akun Lawan
    entries.push({
      kode_akun: receipt.akunLawan.kode_akun,
      tipe: 'KREDIT' as const,
      jumlah: totalDebitPersediaan,
    });

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    const journal = await this.subledgerPostingService.postSubledgerJournal(
      tenantId,
      {
        tanggal: receipt.tanggal instanceof Date ? receipt.tanggal.toISOString().slice(0, 10) : String(receipt.tanggal).slice(0, 10),
        deskripsi: `Penerimaan Persediaan Lainnya - ${receipt.noDokumen}`,
        sumber_aplikasi: 'SUBLEDGER-INV',
        sourceDocType: 'STOCK_RECEIPT_OTHER',
        sourceDocId: receipt.id,
        mata_uang: tenant?.mata_uang || 'IDR',
        entries,
      },
    );

    return this.prisma.stockReceiptOther.update({
      where: { id },
      data: {
        status: 'POSTED',
        journalId: journal.id,
        postedAt: new Date(),
      },
      include: {
        warehouse: true,
        akunLawan: true,
        journal: true,
        lines: { include: { item: true } },
      },
    });
  }

  async void(tenantId: string, id: string, alasan?: string, user?: any) {
    const receipt = await this.findById(tenantId, id);

    if (receipt.status !== 'POSTED') {
      throw new BadRequestException(
        `Hanya dokumen berstatus POSTED yang dapat dibatalkan (void). Status saat ini: ${receipt.status}.`,
      );
    }

    await this.periodService.validateJournalDate(tenantId, new Date(receipt.tanggal));

    // 1. Buat pergerakan stok keluar pembalik
    for (const line of receipt.lines) {
      await this.stockService.executeIssue(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: receipt.warehouseId,
        qty: Number(line.qty),
        tanggal: new Date(),
        sourceDocType: 'VOID_RECEIPT_OTHER',
        sourceDocId: receipt.id,
        tipeMovement: 'ADJUSTMENT_OUT',
        createdBy: user?.nama || 'SYSTEM',
      });
    }

    // 2. Reverse Jurnal GL
    let voidJournalId: string | undefined = undefined;
    if (receipt.journalId) {
      const voidJournal = await this.subledgerPostingService.reverseJournal(
        tenantId,
        receipt.journalId,
        new Date().toISOString().slice(0, 10),
        alasan || `Void Penerimaan Lainnya ${receipt.noDokumen}`,
      );
      voidJournalId = voidJournal.id;
    }

    return this.prisma.stockReceiptOther.update({
      where: { id },
      data: {
        status: 'VOID',
        voidJournalId,
      },
      include: {
        warehouse: true,
        akunLawan: true,
        journal: true,
        lines: { include: { item: true } },
      },
    });
  }
}
