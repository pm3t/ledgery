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
import { PurchaseOrderService } from './purchase-order.service';
import {
  CreateGoodsReceiptDto,
  UpdateGoodsReceiptDto,
  CreateBillFromGrDto,
} from '../dto/goods-receipt.dto';
import { GoodsReceiptStatus, Prisma } from '@prisma/client';

@Injectable()
export class GoodsReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly subledgerPosting: SubledgerPostingService,
    private readonly periodService: AccountingPeriodService,
    private readonly stockService: InventoryStockService,
    private readonly poService: PurchaseOrderService,
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
        'Modul Inventory wajib aktif untuk menggunakan Penerimaan Barang (Goods Receipt).',
      );
    }
    if (!setting.apEnabled) {
      throw new BadRequestException(
        'Modul AP (Hutang) wajib aktif untuk Penerimaan Barang (Goods Receipt).',
      );
    }
    return setting;
  }

  async findAll(
    tenantId: string,
    query?: {
      status?: string;
      poId?: string;
      partnerId?: string;
      warehouseId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ) {
    const where: Prisma.GoodsReceiptWhereInput = { tenantId };

    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as GoodsReceiptStatus;
    }
    if (query?.poId) where.poId = query.poId;
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

    return this.prisma.goodsReceipt.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      include: {
        partner: true,
        warehouse: true,
        po: true,
        lines: {
          include: {
            item: true,
            poLine: true,
          },
        },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const gr = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId },
      include: {
        partner: true,
        warehouse: true,
        po: true,
        journal: true,
        voidJournal: true,
        lines: {
          include: {
            item: true,
            poLine: true,
          },
        },
      },
    });

    if (!gr) {
      throw new NotFoundException(`Penerimaan Barang (GR) dengan ID "${id}" tidak ditemukan.`);
    }

    return gr;
  }

  async create(tenantId: string, dto: CreateGoodsReceiptDto, user?: any) {
    const setting = await this.ensureOrderManagementEnabled(tenantId);

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.goodsReceipt.findUnique({
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
    if (!partner || !partner.isVendor) {
      throw new BadRequestException('Mitra bisnis harus terdaftar sebagai vendor.');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, isActive: true },
    });
    if (!warehouse) {
      throw new BadRequestException('Gudang penerima tidak valid atau tidak aktif.');
    }

    const noDokumen = await this.docNumbering.generateNextNumber(tenantId, 'GOODS_RECEIPT', 'GR');

    const tolerancePct = Number(setting.overDeliveryTolerancePct || 0);

    let totalNilai = 0;
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
          `Baris ${i + 1}: Barang "${item.nama}" bertipe ${item.tipe}. Penerimaan barang fisik hanya untuk tipe STOK.`,
        );
      }

      let biayaSatuan = Number(line.biayaSatuan || 0);

      if (line.poLineId) {
        const poLine = await this.prisma.purchaseOrderLine.findUnique({
          where: { id: line.poLineId },
        });
        if (!poLine) {
          throw new NotFoundException(`Baris ${i + 1}: Baris PO ID "${line.poLineId}" tidak ditemukan.`);
        }

        const poQty = Number(poLine.qty);
        const received = Number(poLine.qtyDiterima);
        const maxAllowed = poQty * (1 + tolerancePct / 100);

        if (received + Number(line.qty) > maxAllowed) {
          throw new BadRequestException(
            `Baris ${i + 1}: Kuantitas diterima (${received + Number(line.qty)}) melebihi batas pesanan PO (${maxAllowed}) dengan toleransi ${tolerancePct}%.`,
          );
        }

        if (biayaSatuan <= 0) {
          const hargaNet = (Number(poLine.qty) * Number(poLine.harga) - Number(poLine.diskon)) / Number(poLine.qty);
          biayaSatuan = Math.max(0, hargaNet);
        }
      } else {
        if (biayaSatuan <= 0) {
          throw new BadRequestException(
            `Baris ${i + 1}: Biaya satuan wajib diisi dan lebih besar dari 0 untuk penerimaan barang tanpa PO.`,
          );
        }
      }

      const lineTotal = Number(line.qty) * biayaSatuan;
      totalNilai += lineTotal;

      processedLines.push({
        poLineId: line.poLineId || null,
        itemId: line.itemId,
        deskripsi: line.deskripsi || item.nama,
        qty: new Prisma.Decimal(line.qty),
        biayaSatuan: new Prisma.Decimal(biayaSatuan),
        totalNilai: new Prisma.Decimal(lineTotal),
        dimensions: line.dimensions || null,
      });
    }

    return this.prisma.goodsReceipt.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        poId: dto.poId || null,
        partnerId: dto.partnerId,
        warehouseId: dto.warehouseId,
        status: GoodsReceiptStatus.DRAFT,
        totalNilai: new Prisma.Decimal(totalNilai),
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
        po: true,
        lines: { include: { item: true, poLine: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateGoodsReceiptDto) {
    const gr = await this.findById(tenantId, id);

    if (gr.status !== GoodsReceiptStatus.DRAFT) {
      throw new BadRequestException(
        `Penerimaan barang berstatus ${gr.status}. Hanya status DRAFT yang dapat diedit.`,
      );
    }

    const setting = await this.ensureOrderManagementEnabled(tenantId);
    const tolerancePct = Number(setting.overDeliveryTolerancePct || 0);

    let totalNilai = 0;
    const processedLines: any[] = [];

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];
      let biayaSatuan = Number(line.biayaSatuan || 0);

      if (line.poLineId) {
        const poLine = await this.prisma.purchaseOrderLine.findUnique({
          where: { id: line.poLineId },
        });
        if (poLine) {
          const poQty = Number(poLine.qty);
          const maxAllowed = poQty * (1 + tolerancePct / 100);
          if (Number(line.qty) > maxAllowed) {
            throw new BadRequestException(`Baris ${i + 1}: Kuantitas melebihi batas pesanan PO.`);
          }
          if (biayaSatuan <= 0) {
            const hargaNet = (Number(poLine.qty) * Number(poLine.harga) - Number(poLine.diskon)) / Number(poLine.qty);
            biayaSatuan = Math.max(0, hargaNet);
          }
        }
      }

      const lineTotal = Number(line.qty) * biayaSatuan;
      totalNilai += lineTotal;

      processedLines.push({
        poLineId: line.poLineId || null,
        itemId: line.itemId,
        deskripsi: line.deskripsi || null,
        qty: new Prisma.Decimal(line.qty),
        biayaSatuan: new Prisma.Decimal(biayaSatuan),
        totalNilai: new Prisma.Decimal(lineTotal),
        dimensions: line.dimensions || null,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.goodsReceiptLine.deleteMany({ where: { receiptId: id } });

      return tx.goodsReceipt.update({
        where: { id },
        data: {
          tanggal: new Date(dto.tanggal),
          poId: dto.poId || gr.poId,
          partnerId: dto.partnerId,
          warehouseId: dto.warehouseId,
          totalNilai: new Prisma.Decimal(totalNilai),
          catatan: dto.catatan || null,
          externalRef: dto.externalRef || null,
          lines: {
            create: processedLines,
          },
        },
        include: {
          partner: true,
          warehouse: true,
          po: true,
          lines: { include: { item: true, poLine: true } },
        },
      });
    });
  }

  /**
   * Posting Goods Receipt ke Buku Besar dan Kartu Stok
   * Aturan:
   * 1. Mutasi stok masuk bertambah via InventoryStockService (RECEIPT_GOODS_RECEIPT).
   * 2. Jurnal: Dr Persediaan (INVENTORY) / Cr Barang Diterima Belum Ditagih (GR_IR_CLEARING).
   * 3. Jika tertaut PO: perbarui qtyDiterima pada PO line dan refresh status PO.
   */
  async post(tenantId: string, id: string, user?: any) {
    const gr = await this.findById(tenantId, id);

    if (gr.status !== GoodsReceiptStatus.DRAFT) {
      throw new BadRequestException(
        `Goods Receipt berstatus ${gr.status}. Hanya status DRAFT yang dapat diposting.`,
      );
    }

    // 1. Validasi Periode Akuntansi
    await this.periodService.validateJournalDate(tenantId, new Date(gr.tanggal));

    // 2. Ambil Akun Kontrol dari Posting Setup
    const groupCode = gr.partner.groupCode || undefined;
    const invSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: 'INVENTORY' },
      include: { account: true },
    });
    const grIrSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: 'GR_IR_CLEARING' },
      include: { account: true },
    });

    if (!invSetup?.account) {
      throw new BadRequestException(
        'Akun kontrol Persediaan (INVENTORY) belum dipetakan di Posting Setup Subledger.',
      );
    }
    if (!grIrSetup?.account) {
      throw new BadRequestException(
        'Akun Kliring Barang Diterima Belum Ditagih (GR_IR_CLEARING) belum dipetakan di Posting Setup Subledger.',
      );
    }

    // 3. Eksekusi Masuk Stok per Baris
    let actualTotalNilai = 0;
    const journalEntries: any[] = [];

    for (const line of gr.lines) {
      const qty = Number(line.qty);
      const biayaSatuan = Number(line.biayaSatuan);
      const lineTotal = Math.round(qty * biayaSatuan * 100) / 100;
      actualTotalNilai += lineTotal;

      await this.stockService.executeReceipt(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: gr.warehouseId,
        qty,
        nilaiMasuk: lineTotal,
        tanggal: new Date(gr.tanggal),
        sourceDocType: 'GOODS_RECEIPT',
        sourceDocId: gr.id,
        tipeMovement: 'RECEIPT_GOODS_RECEIPT',
        biayaSatuanKhusus: biayaSatuan,
        createdBy: user?.nama || 'SYSTEM',
      });

      // Update PO line jika tertaut
      if (line.poLineId) {
        await this.prisma.purchaseOrderLine.update({
          where: { id: line.poLineId },
          data: { qtyDiterima: { increment: qty } },
        });
      }

      const dims = Array.isArray(line.dimensions) ? line.dimensions : undefined;
      journalEntries.push({
        kode_akun: invSetup.account.kode_akun,
        tipe: 'DEBIT',
        jumlah: lineTotal,
        dimensions: dims,
      });
    }

    // Cr GR_IR_CLEARING untuk total penerimaan
    journalEntries.push({
      kode_akun: grIrSetup.account.kode_akun,
      tipe: 'KREDIT',
      jumlah: actualTotalNilai,
    });

    // 4. Posting Jurnal Subledger
    const journal = await this.subledgerPosting.postSubledgerJournal(tenantId, {
      tanggal: new Date(gr.tanggal).toISOString().slice(0, 10),
      sumber_aplikasi: 'SUBLEDGER-OM',
      sourceDocType: 'GOODS_RECEIPT',
      sourceDocId: gr.id,
      deskripsi: `Penerimaan Barang ${gr.noDokumen} - Vendor: ${gr.partner.nama}`,
      entries: journalEntries,
    });

    // 5. Update Status Header PO jika ada
    if (gr.poId) {
      await this.prisma.$transaction(async (tx) => {
        await this.poService.refreshOrderStatus(tx, gr.poId!);
      });
    }

    return this.prisma.goodsReceipt.update({
      where: { id },
      data: {
        status: GoodsReceiptStatus.POSTED,
        totalNilai: new Prisma.Decimal(actualTotalNilai),
        journalId: journal.id,
        postedAt: new Date(),
        postedBy: user?.userId || user?.id || user?.email || 'SYSTEM',
      },
      include: {
        partner: true,
        warehouse: true,
        po: true,
        journal: true,
        lines: { include: { item: true, poLine: true } },
      },
    });
  }

  /**
   * Pembatalan (VOID) Goods Receipt
   * Syarat: Periode akuntansi OPEN dan belum ada baris yang ditagih (qtyDitagih == 0).
   */
  async void(tenantId: string, id: string, alasan?: string, user?: any) {
    const gr = await this.findById(tenantId, id);

    if (gr.status !== GoodsReceiptStatus.POSTED) {
      throw new BadRequestException(
        `Hanya Goods Receipt berstatus POSTED yang dapat dibatalkan (VOID). Status saat ini: ${gr.status}.`,
      );
    }

    // Cek apakah sudah ditagih di faktur pembelian
    const hasBilled = gr.lines.some((l) => Number(l.qtyDitagih) > 0);
    if (hasBilled) {
      throw new BadRequestException(
        'Goods Receipt tidak dapat dibatalkan (VOID) karena sudah memiliki faktur pembelian yang ditagih (qtyDitagih > 0). Batalkan faktur pembelian terlebih dahulu.',
      );
    }

    await this.periodService.validateJournalDate(tenantId, new Date(gr.tanggal));

    // Balik stok fisik (keluarkan dari gudang)
    for (const line of gr.lines) {
      const qty = Number(line.qty);

      await this.stockService.executeIssue(tenantId, {
        tenantId,
        itemId: line.itemId,
        warehouseId: gr.warehouseId,
        qty,
        tanggal: new Date(),
        sourceDocType: 'VOID_GOODS_RECEIPT',
        sourceDocId: gr.id,
        tipeMovement: 'RETURN_PURCHASE',
        createdBy: user?.nama || 'SYSTEM',
      });

      // Kembalikan qtyDiterima pada PO jika tertaut
      if (line.poLineId) {
        await this.prisma.purchaseOrderLine.update({
          where: { id: line.poLineId },
          data: { qtyDiterima: { decrement: qty } },
        });
      }
    }

    // Refresh status PO jika ada
    if (gr.poId) {
      await this.prisma.$transaction(async (tx) => {
        await this.poService.refreshOrderStatus(tx, gr.poId!);
      });
    }

    // Balik jurnal GL jika ada
    let voidJournalId: string | null = null;
    if (gr.journalId) {
      const rev = await this.subledgerPosting.reverseJournal(
        tenantId,
        gr.journalId,
        new Date().toISOString().slice(0, 10),
        alasan || `Void Goods Receipt ${gr.noDokumen}`,
      );
      voidJournalId = rev?.id || null;
    }

    return this.prisma.goodsReceipt.update({
      where: { id },
      data: {
        status: GoodsReceiptStatus.VOID,
        voidJournalId,
        voidedAt: new Date(),
        voidedBy: user?.userId || user?.id || user?.email || 'SYSTEM',
        catatan: alasan ? `${gr.catatan ? gr.catatan + ' | ' : ''}Void: ${alasan}` : gr.catatan,
      },
      include: {
        partner: true,
        warehouse: true,
        po: true,
        journal: true,
        voidJournal: true,
        lines: { include: { item: true, poLine: true } },
      },
    });
  }

  /**
   * Membuat Draft Faktur Pembelian (Purchase Bill) langsung dari baris Goods Receipt
   */
  async createBillFromGr(tenantId: string, id: string, dto: CreateBillFromGrDto, user?: any) {
    const gr = await this.findById(tenantId, id);

    if (gr.status !== GoodsReceiptStatus.POSTED) {
      throw new BadRequestException(
        `Hanya Goods Receipt yang sudah DIPOSTING yang dapat dibuatkan faktur tagihan vendor.`,
      );
    }

    const billLines: any[] = [];

    for (const line of gr.lines) {
      const remainingQty = Number(line.qty) - Number(line.qtyDitagih);
      if (remainingQty <= 0) continue;

      let billQty = remainingQty;
      let hargaSatuan = Number(line.biayaSatuan);
      let diskon = 0;

      if (dto.lines && dto.lines.length > 0) {
        const customLine = dto.lines.find((l) => l.grLineId === line.id);
        if (customLine) {
          billQty = Number(customLine.qty);
          if (customLine.hargaSatuan !== undefined) hargaSatuan = Number(customLine.hargaSatuan);
          if (customLine.diskon !== undefined) diskon = Number(customLine.diskon);
        } else {
          continue; // Jika user memilih spesifik baris
        }
      }

      billLines.push({
        itemId: line.itemId,
        itemType: 'STOCK',
        deskripsi: line.deskripsi || line.item?.nama,
        qty: billQty,
        hargaSatuan,
        diskon,
        ppnRate: 11,
        sourceLineType: 'GR_LINE',
        sourceLineId: line.id,
        warehouseId: gr.warehouseId,
      });
    }

    if (billLines.length === 0) {
      throw new BadRequestException(
        'Semua barang pada Goods Receipt ini sudah selesai ditagih atau tidak ada kuantitas yang dipilih.',
      );
    }

    const billNoDokumen = await this.docNumbering.generateNextNumber(tenantId, 'PURCHASE_BILL', 'BILL');

    // Buat draft bill di database
    let subtotal = 0;
    let totalDiskon = 0;
    let totalPpn = 0;

    const calcLines = billLines.map((l) => {
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

    return this.prisma.purchaseBill.create({
      data: {
        tenantId,
        noDokumen: billNoDokumen,
        noFakturVendor: dto.externalRef || `GR-${gr.noDokumen}`,
        tanggal: new Date(dto.tanggal),
        jatuhTempo: new Date(dto.jatuhTempo),
        partnerId: gr.partnerId,
        mata_uang: gr.po?.mata_uang || 'IDR',
        kurs: gr.po?.kurs || new Prisma.Decimal(1),
        status: 'DRAFT',
        subtotal: new Prisma.Decimal(subtotal),
        totalDiskon: new Prisma.Decimal(totalDiskon),
        totalPpn: new Prisma.Decimal(totalPpn),
        total: new Prisma.Decimal(total),
        saldo: new Prisma.Decimal(total),
        subtotalFungsional: new Prisma.Decimal(subtotal),
        totalDiskonFungsional: new Prisma.Decimal(totalDiskon),
        totalPpnFungsional: new Prisma.Decimal(totalPpn),
        totalFungsional: new Prisma.Decimal(total),
        saldoFungsional: new Prisma.Decimal(total),
        catatan: dto.catatan || `Ditagih dari GR ${gr.noDokumen}`,
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
            sourceLineType: 'GR_LINE',
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

