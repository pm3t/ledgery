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
import { CreateStockTransferDto } from '../dto/stock-transfer.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class StockTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly docNumberingService: DocumentNumberingService,
    private readonly periodService: AccountingPeriodService,
    private readonly stockService: InventoryStockService,
  ) {}

  async findAll(tenantId: string, params?: { status?: string }) {
    const where: any = { tenantId };
    if (params?.status) where.status = params.status;

    return this.prisma.stockTransfer.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        journal: true,
        lines: {
          include: { item: true },
        },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const trf = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        journal: true,
        lines: {
          include: { item: true },
        },
      },
    });

    if (!trf) {
      throw new NotFoundException(`Transfer stok ID "${id}" tidak ditemukan.`);
    }

    return trf;
  }

  async create(tenantId: string, dto: CreateStockTransferDto, user?: any) {
    await this.stockService.ensureInventoryEnabled(tenantId);

    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Gudang asal dan gudang tujuan tidak boleh sama.');
    }

    const noDokumen = await this.docNumberingService.generateNextNumber(
      tenantId,
      'STOCK_TRF',
      'TRF',
    );

    let totalNilai = 0;
    const linesData = [];

    for (const line of dto.lines) {
      const balance = await this.prisma.stockBalance.findUnique({
        where: {
          tenantId_itemId_warehouseId: {
            tenantId,
            itemId: line.itemId,
            warehouseId: dto.fromWarehouseId,
          },
        },
      });

      const currentCost = balance ? Number(balance.biayaRataRata) : 0;
      const unitCost =
        line.biayaSatuan !== undefined && Number(line.biayaSatuan) > 0
          ? Number(line.biayaSatuan)
          : currentCost;

      const lineTotal = Math.round(Number(line.qty) * unitCost * 100) / 100;
      totalNilai += lineTotal;

      linesData.push({
        itemId: line.itemId,
        qty: new Prisma.Decimal(line.qty),
        biayaSatuan: new Prisma.Decimal(unitCost),
        totalNilai: new Prisma.Decimal(lineTotal),
      });
    }

    return this.prisma.stockTransfer.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        status: 'DRAFT',
        totalNilai: new Prisma.Decimal(totalNilai),
        catatan: dto.catatan || null,
        createdBy: user?.nama || user?.email || 'SYSTEM',
        lines: {
          create: linesData,
        },
      },
      include: {
        lines: { include: { item: true } },
        fromWarehouse: true,
        toWarehouse: true,
      },
    });
  }

  async post(tenantId: string, id: string, user?: any) {
    const trf = await this.findById(tenantId, id);

    if (trf.status !== 'DRAFT') {
      throw new BadRequestException(
        `Transfer stok berstatus ${trf.status}, hanya status DRAFT yang dapat diposting.`,
      );
    }

    await this.periodService.validateJournalDate(tenantId, new Date(trf.tanggal));

    let actualTotalNilai = 0;

    // Eksekusi mutasi transfer per baris
    for (const line of trf.lines) {
      const qty = Number(line.qty);

      // 1. Keluarkan dari gudang asal (TRANSFER_OUT)
      const issueRes = await this.stockService.executeIssue(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: trf.fromWarehouseId,
        qty,
        tanggal: new Date(trf.tanggal),
        sourceDocType: 'STOCK_TRANSFER',
        sourceDocId: trf.id,
        tipeMovement: 'TRANSFER_OUT',
        createdBy: user?.nama || 'SYSTEM',
      });

      actualTotalNilai += issueRes.totalHpp;

      // 2. Masukkan ke gudang tujuan (TRANSFER_IN)
      // Khusus barang FIFO: jika issueRes mengonsumsi lapisan asli, bawa rincian lapisan ke gudang tujuan
      if (issueRes.consumedLayers && issueRes.consumedLayers.length > 0) {
        for (const cons of issueRes.consumedLayers) {
          await this.stockService.executeReceipt(tenantId, {
            tenantId,
            itemId: line.itemId,
            warehouseId: trf.toWarehouseId,
            qty: cons.qty,
            nilaiMasuk: Math.round(cons.qty * cons.biayaSatuan * 100) / 100,
            tanggal: new Date(trf.tanggal),
            sourceDocType: 'STOCK_TRANSFER',
            sourceDocId: trf.id,
            tipeMovement: 'TRANSFER_IN',
            biayaSatuanKhusus: cons.biayaSatuan,
            createdBy: user?.nama || 'SYSTEM',
          });
        }
      } else {
        // Moving Average: bawa nilai total HPP
        await this.stockService.executeReceipt(tenantId, {
          tenantId,
          itemId: line.itemId,
          warehouseId: trf.toWarehouseId,
          qty,
          nilaiMasuk: issueRes.totalHpp,
          tanggal: new Date(trf.tanggal),
          sourceDocType: 'STOCK_TRANSFER',
          sourceDocId: trf.id,
          tipeMovement: 'TRANSFER_IN',
          biayaSatuanKhusus: issueRes.biayaSatuan,
          createdBy: user?.nama || 'SYSTEM',
        });
      }
    }

    return this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status: 'POSTED',
        totalNilai: new Prisma.Decimal(actualTotalNilai),
        postedAt: new Date(),
      },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        journal: true,
        lines: { include: { item: true } },
      },
    });
  }

  async void(tenantId: string, id: string, alasan?: string, user?: any) {
    const trf = await this.findById(tenantId, id);

    if (trf.status !== 'POSTED') {
      throw new BadRequestException(
        `Hanya transfer stok berstatus POSTED yang dapat dibatalkan (void).`,
      );
    }

    await this.periodService.validateJournalDate(tenantId, new Date(trf.tanggal));

    // Balik mutasi: keluarkan dari toWarehouse, masukkan kembali ke fromWarehouse
    for (const line of trf.lines) {
      const qty = Number(line.qty);

      const issueRes = await this.stockService.executeIssue(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: trf.toWarehouseId,
        qty,
        tanggal: new Date(),
        sourceDocType: 'VOID_STOCK_TRANSFER',
        sourceDocId: trf.id,
        tipeMovement: 'TRANSFER_OUT',
        createdBy: user?.nama || 'SYSTEM',
      });

      await this.stockService.executeReceipt(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: trf.fromWarehouseId,
        qty,
        nilaiMasuk: issueRes.totalHpp,
        tanggal: new Date(),
        sourceDocType: 'VOID_STOCK_TRANSFER',
        sourceDocId: trf.id,
        tipeMovement: 'TRANSFER_IN',
        biayaSatuanKhusus: issueRes.biayaSatuan,
        createdBy: user?.nama || 'SYSTEM',
      });
    }

    return this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status: 'VOID',
      },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        journal: true,
        lines: { include: { item: true } },
      },
    });
  }
}
