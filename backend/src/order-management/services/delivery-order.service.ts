import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentNumberingService } from '../../subledger/document-numbering.service';
import { SubledgerPostingService } from '../../subledger/subledger-posting.service';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import { InventoryStockService } from '../../inventory/services/inventory-stock.service';
import { SalesOrderService } from './sales-order.service';
import {
  CreateDeliveryOrderDto,
  UpdateDeliveryOrderDto,
  CreateInvoiceFromDoDto,
} from '../dto/delivery-order.dto';
import { DeliveryOrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class DeliveryOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly subledgerPosting: SubledgerPostingService,
    private readonly periodService: AccountingPeriodService,
    private readonly stockService: InventoryStockService,
    private readonly soService: SalesOrderService,
  ) {}

  async ensureOrderManagementEnabled(tenantId: string) {
    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });
    if (!setting || !setting.orderManagementEnabled) {
      throw new BadRequestException(
        'Modul Order Management belum diaktifkan. Aktifkan di Pengaturan Subledger terlebih dahulu.',
      );
    }
    if (!setting.inventoryEnabled) {
      throw new BadRequestException(
        'Modul Inventory wajib aktif untuk Surat Jalan / Pengiriman Barang (Delivery Order).',
      );
    }
    if (!setting.arEnabled) {
      throw new BadRequestException(
        'Modul AR (Piutang) wajib aktif untuk Pengiriman Barang (Delivery Order).',
      );
    }
    return setting;
  }

  async findAll(
    tenantId: string,
    query?: {
      status?: string;
      soId?: string;
      partnerId?: string;
      warehouseId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ) {
    const where: Prisma.DeliveryOrderWhereInput = { tenantId };

    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as DeliveryOrderStatus;
    }
    if (query?.soId) where.soId = query.soId;
    if (query?.partnerId) where.partnerId = query.partnerId;
    if (query?.warehouseId) where.warehouseId = query.warehouseId;
    if (query?.startDate || query?.endDate) {
      where.tanggal = {};
      if (query.startDate) where.tanggal.gte = new Date(query.startDate);
      if (query.endDate) where.tanggal.lte = new Date(query.endDate);
    }
    if (query?.search) {
      where.OR = [
        { noDokumen: { contains: query.search, mode: 'insensitive' } },
        { partner: { nama: { contains: query.search, mode: 'insensitive' } } },
        { externalRef: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.deliveryOrder.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      include: {
        partner: true,
        warehouse: true,
        so: true,
        lines: {
          include: {
            item: true,
            soLine: true,
          },
        },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const dOrder = await this.prisma.deliveryOrder.findFirst({
      where: { id, tenantId },
      include: {
        partner: true,
        warehouse: true,
        so: true,
        journal: true,
        voidJournal: true,
        lines: {
          include: {
            item: true,
            soLine: true,
          },
        },
      },
    });

    if (!dOrder) {
      throw new NotFoundException(`Surat Jalan (DO) dengan ID "${id}" tidak ditemukan.`);
    }

    return dOrder;
  }

  async create(tenantId: string, dto: CreateDeliveryOrderDto, user?: any) {
    const setting = await this.ensureOrderManagementEnabled(tenantId);

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.deliveryOrder.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: { lines: true, partner: true },
      });
      if (existing) return existing;
    }

    const partner = await this.prisma.businessPartner.findFirst({
      where: { id: dto.partnerId, tenantId },
    });
    if (!partner || !partner.isCustomer) {
      throw new BadRequestException('Mitra bisnis harus terdaftar sebagai pelanggan yang valid.');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, isActive: true },
    });
    if (!warehouse) {
      throw new BadRequestException('Gudang pengeluaran tidak valid atau tidak aktif.');
    }

    const noDokumen = await this.docNumbering.generateNextNumber(tenantId, 'DELIVERY_ORDER', 'DO');

    const tolerancePct = Number(setting.overDeliveryTolerancePct || 0);
    const processedLines: any[] = [];

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId },
      });
      if (!item) {
        throw new NotFoundException(`Baris ${i + 1}: Barang dengan ID "${line.itemId}" tidak ditemukan.`);
      }
      if (item.tipe !== 'STOK') {
        throw new BadRequestException(
          `Baris ${i + 1}: Barang "${item.nama}" bertipe ${item.tipe}. Pengiriman barang fisik hanya untuk tipe STOK.`,
        );
      }

      if (line.soLineId) {
        const soLine = await this.prisma.salesOrderLine.findUnique({
          where: { id: line.soLineId },
        });
        if (!soLine) {
          throw new NotFoundException(`Baris ${i + 1}: Baris SO ID "${line.soLineId}" tidak ditemukan.`);
        }

        const soQty = Number(soLine.qty);
        const delivered = Number(soLine.qtyDikirim);
        const maxAllowed = soQty * (1 + tolerancePct / 100);

        if (delivered + Number(line.qty) > maxAllowed) {
          throw new BadRequestException(
            `Baris ${i + 1}: Kuantitas dikirim (${delivered + Number(line.qty)}) melebihi batas pesanan SO (${maxAllowed}) dengan toleransi ${tolerancePct}%.`,
          );
        }
      }

      processedLines.push({
        soLineId: line.soLineId || null,
        itemId: line.itemId,
        deskripsi: line.deskripsi || item.nama,
        qty: new Prisma.Decimal(line.qty),
        biayaTotal: new Prisma.Decimal(0),
        dimensions: line.dimensions || null,
      });
    }

    return this.prisma.deliveryOrder.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        soId: dto.soId || null,
        partnerId: dto.partnerId,
        warehouseId: dto.warehouseId,
        status: DeliveryOrderStatus.DRAFT,
        totalNilaiHpp: new Prisma.Decimal(0),
        catatan: dto.catatan || null,
        externalRef: dto.externalRef || null,
        idempotencyKey: dto.idempotencyKey || null,
        createdBy: user?.nama || 'SYSTEM',
        lines: {
          create: processedLines,
        },
      },
      include: {
        partner: true,
        warehouse: true,
        so: true,
        lines: { include: { item: true, soLine: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateDeliveryOrderDto) {
    const dOrder = await this.findById(tenantId, id);

    if (dOrder.status !== DeliveryOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Surat Jalan (DO) berstatus ${dOrder.status}. Hanya status DRAFT yang dapat diedit.`,
      );
    }

    const setting = await this.ensureOrderManagementEnabled(tenantId);
    const tolerancePct = Number(setting.overDeliveryTolerancePct || 0);

    const processedLines: any[] = [];

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];

      if (line.soLineId) {
        const soLine = await this.prisma.salesOrderLine.findUnique({
          where: { id: line.soLineId },
        });
        if (soLine) {
          const soQty = Number(soLine.qty);
          const maxAllowed = soQty * (1 + tolerancePct / 100);
          if (Number(line.qty) > maxAllowed) {
            throw new BadRequestException(`Baris ${i + 1}: Kuantitas melebihi batas pesanan SO.`);
          }
        }
      }

      processedLines.push({
        soLineId: line.soLineId || null,
        itemId: line.itemId,
        deskripsi: line.deskripsi || null,
        qty: new Prisma.Decimal(line.qty),
        biayaTotal: new Prisma.Decimal(0),
        dimensions: line.dimensions || null,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.deliveryOrderLine.deleteMany({ where: { deliveryId: id } });

      return tx.deliveryOrder.update({
        where: { id },
        data: {
          tanggal: new Date(dto.tanggal),
          soId: dto.soId || dOrder.soId,
          partnerId: dto.partnerId,
          warehouseId: dto.warehouseId,
          catatan: dto.catatan || null,
          externalRef: dto.externalRef || null,
          lines: {
            create: processedLines,
          },
        },
        include: {
          partner: true,
          warehouse: true,
          so: true,
          lines: { include: { item: true, soLine: true } },
        },
      });
    });
  }

  /**
   * Posting Surat Jalan (DO) ke Buku Besar dan Kartu Stok
   * Aturan:
   * 1. Mutasi stok keluar via InventoryStockService (ISSUE_DELIVERY_ORDER), HPP dihitung via ValuationStrategy.
   * 2. Jurnal: Dr HPP (COGS) / Cr Persediaan (INVENTORY).
   * 3. Jika tertaut SO: perbarui qtyDikirim pada SO line dan refresh status SO.
   */
  async post(tenantId: string, id: string, user?: any) {
    const dOrder = await this.findById(tenantId, id);

    if (dOrder.status !== DeliveryOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Surat Jalan (DO) berstatus ${dOrder.status}. Hanya status DRAFT yang dapat diposting.`,
      );
    }

    // 1. Validasi Periode Akuntansi
    await this.periodService.validateJournalDate(tenantId, new Date(dOrder.tanggal));

    // 2. Ambil Akun Kontrol dari Posting Setup
    const setting = await this.prisma.subledgerSetting.findUnique({ where: { tenantId } });
    const cogsSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: 'COGS' },
      include: { account: true },
    });
    const invSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: 'INVENTORY' },
      include: { account: true },
    });

    if (!cogsSetup?.account) {
      throw new BadRequestException(
        'Akun Beban Pokok Penjualan (COGS) belum dipetakan di Posting Setup Subledger.',
      );
    }
    if (!invSetup?.account) {
      throw new BadRequestException(
        'Akun kontrol Persediaan (INVENTORY) belum dipetakan di Posting Setup Subledger.',
      );
    }

    // 3. Eksekusi Pengeluaran Stok per Baris
    let totalNilaiHpp = 0;
    const journalEntries: any[] = [];

    for (const line of dOrder.lines) {
      const qty = Number(line.qty);

      const issueRes = await this.stockService.executeIssue(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: dOrder.warehouseId,
        qty,
        tanggal: new Date(dOrder.tanggal),
        sourceDocType: 'DELIVERY_ORDER',
        sourceDocId: dOrder.id,
        tipeMovement: 'ISSUE_DELIVERY_ORDER',
        allowNegativeStock: setting?.allowNegativeStock ?? false,
        createdBy: user?.nama || 'SYSTEM',
      });

      const lineHpp = Math.round(issueRes.totalHpp * 100) / 100;
      totalNilaiHpp += lineHpp;

      // Update biayaTotal pada baris DO
      await this.prisma.deliveryOrderLine.update({
        where: { id: line.id },
        data: { biayaTotal: new Prisma.Decimal(lineHpp) },
      });

      // Update SO line jika tertaut
      if (line.soLineId) {
        await this.prisma.salesOrderLine.update({
          where: { id: line.soLineId },
          data: { qtyDikirim: { increment: qty } },
        });
      }

      const dims = Array.isArray(line.dimensions) ? line.dimensions : undefined;
      journalEntries.push({
        kode_akun: cogsSetup.account.kode_akun,
        tipe: 'DEBIT',
        jumlah: lineHpp,
        dimensions: dims,
      });
    }

    // Cr INVENTORY untuk total HPP
    journalEntries.push({
      kode_akun: invSetup.account.kode_akun,
      tipe: 'KREDIT',
      jumlah: totalNilaiHpp,
    });

    // 4. Posting Jurnal Subledger
    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: new Date(dOrder.tanggal).toISOString().slice(0, 10),
      sumber_aplikasi: 'SUBLEDGER-OM',
      sourceDocType: 'DELIVERY_ORDER',
      sourceDocId: dOrder.id,
      deskripsi: `Pengiriman Barang ${dOrder.noDokumen} - Pelanggan: ${dOrder.partner.nama}`,
      entries: journalEntries,
    });

    // 5. Update Status Header SO jika ada
    if (dOrder.soId) {
      await this.prisma.$transaction(async (tx) => {
        await this.soService.refreshOrderStatus(tx, dOrder.soId!);
      });
    }

    return this.prisma.deliveryOrder.update({
      where: { id },
      data: {
        status: DeliveryOrderStatus.POSTED,
        totalNilaiHpp: new Prisma.Decimal(totalNilaiHpp),
        journalId: journal.id,
        postedAt: new Date(),
      },
      include: {
        partner: true,
        warehouse: true,
        so: true,
        journal: true,
        lines: { include: { item: true, soLine: true } },
      },
    });
  }

  /**
   * Pembatalan (VOID) Surat Jalan (DO)
   * Syarat: Periode akuntansi OPEN dan belum ada baris yang ditagih (qtyDitagih == 0).
   */
  async void(tenantId: string, id: string, alasan?: string, user?: any) {
    const dOrder = await this.findById(tenantId, id);

    if (dOrder.status !== DeliveryOrderStatus.POSTED) {
      throw new BadRequestException(
        `Hanya Surat Jalan berstatus POSTED yang dapat dibatalkan (VOID). Status saat ini: ${dOrder.status}.`,
      );
    }

    // Cek apakah sudah ditagih di faktur penjualan
    const hasBilled = dOrder.lines.some((l) => Number(l.qtyDitagih) > 0);
    if (hasBilled) {
      throw new BadRequestException(
        'Surat Jalan tidak dapat dibatalkan (VOID) karena sudah memiliki faktur penjualan yang ditagih (qtyDitagih > 0). Batalkan faktur penjualan terlebih dahulu.',
      );
    }

    await this.periodService.validateJournalDate(tenantId, new Date(dOrder.tanggal));

    // Balik stok fisik (masukkan kembali ke gudang dengan biayaTotal semula)
    for (const line of dOrder.lines) {
      const qty = Number(line.qty);
      const nilaiMasuk = Number(line.biayaTotal);

      await this.stockService.executeReceipt(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: dOrder.warehouseId,
        qty,
        nilaiMasuk,
        tanggal: new Date(),
        sourceDocType: 'VOID_DELIVERY_ORDER',
        sourceDocId: dOrder.id,
        tipeMovement: 'RETURN_SALE',
        createdBy: user?.nama || 'SYSTEM',
      });

      // Kembalikan qtyDikirim pada SO jika tertaut
      if (line.soLineId) {
        await this.prisma.salesOrderLine.update({
          where: { id: line.soLineId },
          data: { qtyDikirim: { decrement: qty } },
        });
      }
    }

    // Refresh status SO jika ada
    if (dOrder.soId) {
      await this.prisma.$transaction(async (tx) => {
        await this.soService.refreshOrderStatus(tx, dOrder.soId!);
      });
    }

    // Balik jurnal GL jika ada
    let voidJournalId: string | null = null;
    if (dOrder.journalId) {
      const rev = await this.subledgerPosting.reverseJournal(
        tenantId,
        dOrder.journalId,
        new Date().toISOString().slice(0, 10),
        alasan || `Void Delivery Order ${dOrder.noDokumen}`,
      );
      voidJournalId = rev?.id || null;
    }

    return this.prisma.deliveryOrder.update({
      where: { id },
      data: {
        status: DeliveryOrderStatus.VOID,
        voidJournalId,
        catatan: alasan ? `${dOrder.catatan ? dOrder.catatan + ' | ' : ''}Void: ${alasan}` : dOrder.catatan,
      },
      include: {
        partner: true,
        warehouse: true,
        so: true,
        journal: true,
        voidJournal: true,
        lines: { include: { item: true, soLine: true } },
      },
    });
  }

  /**
   * Membuat Draft Faktur Penjualan (Sales Invoice) langsung dari baris Delivery Order
   */
  async createInvoiceFromDo(tenantId: string, id: string, dto: CreateInvoiceFromDoDto, user?: any) {
    const dOrder = await this.findById(tenantId, id);

    if (dOrder.status !== DeliveryOrderStatus.POSTED) {
      throw new BadRequestException(
        `Hanya Surat Jalan yang sudah DIPOSTING yang dapat dibuatkan faktur penjualan.`,
      );
    }

    const invoiceLines: any[] = [];

    for (const line of dOrder.lines) {
      const remainingQty = Number(line.qty) - Number(line.qtyDitagih);
      if (remainingQty <= 0) continue;

      let invQty = remainingQty;
      let hargaSatuan = 0;
      let diskon = 0;

      // Ambil default harga dari baris SO jika tertaut
      if (line.soLine) {
        hargaSatuan = Number(line.soLine.harga);
        diskon = Number(line.soLine.diskon);
      }

      if (dto.lines && dto.lines.length > 0) {
        const customLine = dto.lines.find((l) => l.doLineId === line.id);
        if (customLine) {
          invQty = Number(customLine.qty);
          if (customLine.hargaSatuan !== undefined) hargaSatuan = Number(customLine.hargaSatuan);
          if (customLine.diskon !== undefined) diskon = Number(customLine.diskon);
        } else {
          continue;
        }
      }

      invoiceLines.push({
        itemId: line.itemId,
        itemType: 'STOCK',
        deskripsi: line.deskripsi || line.item?.nama,
        qty: invQty,
        hargaSatuan,
        diskon,
        ppnRate: 11,
        sourceLineType: 'DO_LINE',
        sourceLineId: line.id,
        warehouseId: dOrder.warehouseId,
      });
    }

    if (invoiceLines.length === 0) {
      throw new BadRequestException(
        'Semua barang pada Surat Jalan ini sudah selesai ditagih atau tidak ada kuantitas yang dipilih.',
      );
    }

    const invNoDokumen = await this.docNumbering.generateNextNumber(tenantId, 'SALES_INVOICE', 'INV');

    // Buat draft invoice di database
    let subtotal = 0;
    let totalDiskon = 0;
    let totalPpn = 0;

    const calcLines = invoiceLines.map((l) => {
      const lineSub = l.qty * l.hargaSatuan;
      const dpp = Math.max(0, lineSub - l.diskon);
      const ppn = (dpp * l.ppnRate) / 100;
      subtotal += lineSub;
      totalDiskon += l.diskon;
      totalPpn += ppn;
      return {
        ...l,
        jumlah: new Prisma.Decimal(dpp + ppn),
        qty: new Prisma.Decimal(l.qty),
        hargaSatuan: new Prisma.Decimal(l.hargaSatuan),
        diskon: new Prisma.Decimal(l.diskon),
        ppnRate: new Prisma.Decimal(l.ppnRate),
      };
    });

    const total = subtotal - totalDiskon + totalPpn;

    return this.prisma.salesInvoice.create({
      data: {
        tenantId,
        noDokumen: invNoDokumen,
        tanggal: new Date(dto.tanggal),
        jatuhTempo: new Date(dto.jatuhTempo),
        partnerId: dOrder.partnerId,
        mata_uang: dOrder.so?.mata_uang || 'IDR',
        kurs: dOrder.so?.kurs || new Prisma.Decimal(1),
        status: 'DRAFT',
        subtotal: new Prisma.Decimal(subtotal),
        totalDiskon: new Prisma.Decimal(totalDiskon),
        totalPpn: new Prisma.Decimal(totalPpn),
        total: new Prisma.Decimal(total),
        totalDialokasikan: new Prisma.Decimal(0),
        saldo: new Prisma.Decimal(total),
        subtotalFungsional: new Prisma.Decimal(subtotal),
        totalDiskonFungsional: new Prisma.Decimal(totalDiskon),
        totalPpnFungsional: new Prisma.Decimal(totalPpn),
        totalFungsional: new Prisma.Decimal(total),
        saldoFungsional: new Prisma.Decimal(total),
        catatan: dto.catatan || `Ditagih dari DO ${dOrder.noDokumen}`,
        externalRef: dto.externalRef || null,
        createdBy: user?.nama || 'SYSTEM',
        lines: {
          create: calcLines.map((l) => ({
            itemId: l.itemId,
            itemType: l.itemType,
            deskripsi: l.deskripsi,
            qty: l.qty,
            hargaSatuan: l.hargaSatuan,
            diskon: l.diskon,
            ppnRate: l.ppnRate,
            jumlah: l.jumlah,
            sourceLineType: 'DO_LINE',
            sourceLineId: l.sourceLineId,
            warehouseId: l.warehouseId,
          })),
        },
      },
      include: {
        partner: true,
        lines: true,
      },
    });
  }
}

