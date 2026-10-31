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
import { CreateStockAdjustmentDto } from '../dto/stock-adjustment.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class StockAdjustmentService {
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

    return this.prisma.stockAdjustment.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      include: {
        warehouse: true,
        journal: true,
        lines: {
          include: { item: true },
        },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const adj = await this.prisma.stockAdjustment.findFirst({
      where: { id, tenantId },
      include: {
        warehouse: true,
        journal: true,
        lines: {
          include: { item: true },
        },
      },
    });

    if (!adj) {
      throw new NotFoundException(`Penyesuaian stok ID "${id}" tidak ditemukan.`);
    }

    return adj;
  }

  async create(tenantId: string, dto: CreateStockAdjustmentDto, user?: any) {
    await this.stockService.ensureInventoryEnabled(tenantId);

    const noDokumen = await this.docNumberingService.generateNextNumber(
      tenantId,
      'STOCK_ADJ',
      'ADJ',
    );

    let netSelisihNilai = 0;
    const linesData = [];

    for (const line of dto.lines) {
      // Ambil qty sistem saat ini dari StockBalance
      const balance = await this.prisma.stockBalance.findUnique({
        where: {
          tenantId_itemId_warehouseId: {
            tenantId,
            itemId: line.itemId,
            warehouseId: dto.warehouseId,
          },
        },
      });

      const qtySistem = balance ? Number(balance.qty) : 0;
      const currentCost = balance ? Number(balance.biayaRataRata) : 0;
      const selisihQty = Math.round((Number(line.qtyFisik) - qtySistem) * 10000) / 10000;

      const unitCost =
        line.biayaSatuan !== undefined && Number(line.biayaSatuan) > 0
          ? Number(line.biayaSatuan)
          : currentCost;

      const selisihNilai = Math.round(selisihQty * unitCost * 100) / 100;
      netSelisihNilai += selisihNilai;

      linesData.push({
        itemId: line.itemId,
        qtySistem: new Prisma.Decimal(qtySistem),
        qtyFisik: new Prisma.Decimal(line.qtyFisik),
        selisihQty: new Prisma.Decimal(selisihQty),
        biayaSatuan: new Prisma.Decimal(unitCost),
        selisihNilai: new Prisma.Decimal(selisihNilai),
        catatan: line.catatan || null,
      });
    }

    return this.prisma.stockAdjustment.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        warehouseId: dto.warehouseId,
        status: 'DRAFT',
        totalSelisihNilai: new Prisma.Decimal(netSelisihNilai),
        catatan: dto.catatan || null,
        createdBy: user?.nama || user?.email || 'SYSTEM',
        lines: {
          create: linesData,
        },
      },
      include: {
        lines: { include: { item: true } },
        warehouse: true,
      },
    });
  }

  async post(tenantId: string, id: string, user?: any) {
    const adj = await this.findById(tenantId, id);

    if (adj.status !== 'DRAFT') {
      throw new BadRequestException(
        `Penyesuaian stok berstatus ${adj.status}, hanya status DRAFT yang dapat diposting.`,
      );
    }

    await this.periodService.validateJournalDate(tenantId, new Date(adj.tanggal));

    let totalLebih = 0;
    let totalKurang = 0;

    // 1. Eksekusi mutasi fisik per baris
    for (const line of adj.lines) {
      const diff = Number(line.selisihQty);
      if (diff > 0) {
        // Selisih Lebih: RECEIPT
        const res = await this.stockService.executeReceipt(tenantId, {
          tenantId,
          itemId: line.itemId,
          warehouseId: adj.warehouseId,
          qty: diff,
          nilaiMasuk: Math.abs(Number(line.selisihNilai)),
          tanggal: new Date(adj.tanggal),
          sourceDocType: 'STOCK_ADJUSTMENT',
          sourceDocId: adj.id,
          tipeMovement: 'ADJUSTMENT_IN',
          biayaSatuanKhusus: Number(line.biayaSatuan),
          createdBy: user?.nama || 'SYSTEM',
        });
        totalLebih += res.nilaiMasuk;
      } else if (diff < 0) {
        // Selisih Kurang: ISSUE
        const res = await this.stockService.executeIssue(tenantId, {
          tenantId,
          itemId: line.itemId,
          warehouseId: adj.warehouseId,
          qty: Math.abs(diff),
          tanggal: new Date(adj.tanggal),
          sourceDocType: 'STOCK_ADJUSTMENT',
          sourceDocId: adj.id,
          tipeMovement: 'ADJUSTMENT_OUT',
          createdBy: user?.nama || 'SYSTEM',
        });
        totalKurang += res.totalHpp;
      }
    }

    // 2. Buat jurnal penyesuaian GL jika ada perubahan nilai
    let journalId: string | undefined = undefined;
    const netDifference = Math.round((totalLebih - totalKurang) * 100) / 100;

    if (netDifference !== 0) {
      const invSetup = await this.prisma.postingSetup.findFirst({
        where: { tenantId, key: 'INVENTORY' },
        include: { account: true },
      });
      const adjSetup = await this.prisma.postingSetup.findFirst({
        where: { tenantId, key: 'INVENTORY_ADJUSTMENT' },
        include: { account: true },
      });

      if (!invSetup?.account || !adjSetup?.account) {
        throw new BadRequestException(
          'Akun INVENTORY atau INVENTORY_ADJUSTMENT belum dipetakan di Posting Setup Subledger.',
        );
      }

      const invAccount = invSetup.account;
      const adjAccount = adjSetup.account;

      const entries: any[] = [];
      if (netDifference > 0) {
        // Nilai persediaan naik: Dr Persediaan / Cr Penyesuaian Persediaan
        entries.push({
          kode_akun: invAccount.kode_akun,
          tipe: 'DEBIT' as const,
          jumlah: Math.abs(netDifference),
        });
        entries.push({
          kode_akun: adjAccount.kode_akun,
          tipe: 'KREDIT' as const,
          jumlah: Math.abs(netDifference),
        });
      } else {
        // Nilai persediaan turun: Dr Penyesuaian Persediaan / Cr Persediaan
        entries.push({
          kode_akun: adjAccount.kode_akun,
          tipe: 'DEBIT' as const,
          jumlah: Math.abs(netDifference),
        });
        entries.push({
          kode_akun: invAccount.kode_akun,
          tipe: 'KREDIT' as const,
          jumlah: Math.abs(netDifference),
        });
      }

      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

      const journal = await this.subledgerPostingService.postSubledgerJournal(
        tenantId,
        {
          tanggal: adj.tanggal instanceof Date ? adj.tanggal.toISOString().slice(0, 10) : String(adj.tanggal).slice(0, 10),
          deskripsi: `Penyesuaian Stok (Opname) - ${adj.noDokumen}`,
          sumber_aplikasi: 'SUBLEDGER-INV',
          sourceDocType: 'STOCK_ADJUSTMENT',
          sourceDocId: adj.id,
          mata_uang: tenant?.mata_uang || 'IDR',
          entries,
        },
      );
      journalId = journal.id;
    }

    return this.prisma.stockAdjustment.update({
      where: { id },
      data: {
        status: 'POSTED',
        totalSelisihNilai: new Prisma.Decimal(netDifference),
        journalId,
        postedAt: new Date(),
      },
      include: {
        warehouse: true,
        journal: true,
        lines: { include: { item: true } },
      },
    });
  }

  async void(tenantId: string, id: string, alasan?: string, user?: any) {
    const adj = await this.findById(tenantId, id);

    if (adj.status !== 'POSTED') {
      throw new BadRequestException(
        `Hanya penyesuaian stok berstatus POSTED yang dapat dibatalkan (void).`,
      );
    }

    await this.periodService.validateJournalDate(tenantId, new Date(adj.tanggal));

    // Balik pergerakan stok
    for (const line of adj.lines) {
      const diff = Number(line.selisihQty);
      if (diff > 0) {
        // Dulu bertambah, sekarang kurangi
        await this.stockService.executeIssue(tenantId, {
          tenantId,
          itemId: line.itemId,
          warehouseId: adj.warehouseId,
          qty: diff,
          tanggal: new Date(),
          sourceDocType: 'VOID_STOCK_ADJUSTMENT',
          sourceDocId: adj.id,
          tipeMovement: 'ADJUSTMENT_OUT',
          createdBy: user?.nama || 'SYSTEM',
        });
      } else if (diff < 0) {
        // Dulu berkurang, sekarang kembalikan
        await this.stockService.executeReceipt(tenantId, {
          tenantId,
          itemId: line.itemId,
          warehouseId: adj.warehouseId,
          qty: Math.abs(diff),
          nilaiMasuk: Math.abs(Number(line.selisihNilai)),
          tanggal: new Date(),
          sourceDocType: 'VOID_STOCK_ADJUSTMENT',
          sourceDocId: adj.id,
          tipeMovement: 'ADJUSTMENT_IN',
          biayaSatuanKhusus: Number(line.biayaSatuan),
          createdBy: user?.nama || 'SYSTEM',
        });
      }
    }

    let voidJournalId: string | undefined = undefined;
    if (adj.journalId) {
      const voidJournal = await this.subledgerPostingService.reverseJournal(
        tenantId,
        adj.journalId,
        new Date().toISOString().slice(0, 10),
        alasan || `Void Penyesuaian Stok ${adj.noDokumen}`,
      );
      voidJournalId = voidJournal.id;
    }

    return this.prisma.stockAdjustment.update({
      where: { id },
      data: {
        status: 'VOID',
        voidJournalId,
      },
      include: {
        warehouse: true,
        journal: true,
        lines: { include: { item: true } },
      },
    });
  }
}
