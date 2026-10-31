import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentNumberingService } from '../../subledger/document-numbering.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  CreateGoodsReceiptFromPoDto,
  CreateBillFromPoDto,
} from '../dto/purchase-order.dto';
import { OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumbering: DocumentNumberingService,
  ) {}

  /**
   * Validasi aktivasi Order Management dan subledger AP
   */
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
        'Modul Inventory wajib aktif untuk menggunakan fitur Order Management.',
      );
    }
    if (!setting.apEnabled) {
      throw new BadRequestException(
        'Modul AP (Hutang) wajib aktif untuk membuat Pesanan Pembelian (PO).',
      );
    }
    return setting;
  }

  private calculateTotals(lines: any[]) {
    let subtotal = 0;
    let totalDiskon = 0;
    let totalPpn = 0;

    const calcLines = lines.map((l) => {
      const qty = Number(l.qty || 1);
      const harga = Number(l.harga || 0);
      const diskon = Number(l.diskon || 0);
      const ppnRate = Number(l.ppnRate || 0);

      const lineGross = qty * harga;
      const dpp = Math.max(0, lineGross - diskon);
      const ppn = (dpp * ppnRate) / 100;
      const jumlah = dpp + ppn;

      subtotal += lineGross;
      totalDiskon += diskon;
      totalPpn += ppn;

      return {
        ...l,
        qty: new Prisma.Decimal(qty),
        harga: new Prisma.Decimal(harga),
        diskon: new Prisma.Decimal(diskon),
        ppnRate: new Prisma.Decimal(ppnRate),
        jumlah: new Prisma.Decimal(jumlah),
      };
    });

    const total = subtotal - totalDiskon + totalPpn;

    return {
      subtotal: new Prisma.Decimal(subtotal),
      totalDiskon: new Prisma.Decimal(totalDiskon),
      totalPpn: new Prisma.Decimal(totalPpn),
      total: new Prisma.Decimal(total),
      calculatedLines: calcLines,
    };
  }

  async findAll(
    tenantId: string,
    query?: {
      status?: string;
      partnerId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ) {
    const where: Prisma.PurchaseOrderWhereInput = { tenantId };

    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as OrderStatus;
    }
    if (query?.partnerId) {
      where.partnerId = query.partnerId;
    }
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

    return this.prisma.purchaseOrder.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      include: {
        partner: true,
        lines: {
          include: {
            item: true,
            warehouse: true,
          },
        },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        partner: true,
        lines: {
          include: {
            item: true,
            warehouse: true,
          },
        },
        receipts: {
          include: {
            warehouse: true,
            lines: true,
          },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Pesanan Pembelian (PO) dengan ID "${id}" tidak ditemukan.`);
    }

    return po;
  }

  async create(tenantId: string, dto: CreatePurchaseOrderDto, user?: any) {
    await this.ensureOrderManagementEnabled(tenantId);

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.purchaseOrder.findUnique({
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
      throw new BadRequestException('Mitra bisnis harus terdaftar sebagai vendor yang valid.');
    }
    if (!partner.isActive) {
      throw new BadRequestException(`Vendor "${partner.nama}" sedang tidak aktif.`);
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const mataUang = dto.mata_uang || partner.mata_uang || tenant?.mata_uang || 'IDR';
    const kurs = dto.kurs || 1;

    const noDokumen = await this.docNumbering.generateNextNumber(tenantId, 'PURCHASE_ORDER', 'PO');
    const totals = this.calculateTotals(dto.lines);

    const initialStatus = dto.status === OrderStatus.OPEN ? OrderStatus.OPEN : OrderStatus.DRAFT;

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        tanggalDiharapkan: dto.tanggalDiharapkan ? new Date(dto.tanggalDiharapkan) : null,
        partnerId: dto.partnerId,
        mata_uang: mataUang,
        kurs: new Prisma.Decimal(kurs),
        status: initialStatus,
        subtotal: totals.subtotal,
        totalDiskon: totals.totalDiskon,
        totalPpn: totals.totalPpn,
        total: totals.total,
        catatan: dto.catatan || null,
        externalRef: dto.externalRef || null,
        idempotencyKey: dto.idempotencyKey || null,
        createdBy: user?.nama || 'SYSTEM',
        lines: {
          create: totals.calculatedLines.map((l) => ({
            itemId: l.itemId || null,
            deskripsi: l.deskripsi,
            qty: l.qty,
            harga: l.harga,
            diskon: l.diskon,
            ppnRate: l.ppnRate,
            jumlah: l.jumlah,
            warehouseId: l.warehouseId || null,
            dimensions: l.dimensions || null,
          })),
        },
      },
      include: {
        partner: true,
        lines: { include: { item: true, warehouse: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdatePurchaseOrderDto) {
    const po = await this.findById(tenantId, id);

    if (po.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        `Pesanan Pembelian berstatus ${po.status}. Hanya status DRAFT yang dapat diedit.`,
      );
    }

    const totals = this.calculateTotals(dto.lines);
    const kurs = dto.kurs || Number(po.kurs);

    return this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderLine.deleteMany({ where: { poId: id } });

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          tanggal: new Date(dto.tanggal),
          tanggalDiharapkan: dto.tanggalDiharapkan ? new Date(dto.tanggalDiharapkan) : null,
          partnerId: dto.partnerId,
          mata_uang: dto.mata_uang || po.mata_uang,
          kurs: new Prisma.Decimal(kurs),
          subtotal: totals.subtotal,
          totalDiskon: totals.totalDiskon,
          totalPpn: totals.totalPpn,
          total: totals.total,
          catatan: dto.catatan || null,
          externalRef: dto.externalRef || null,
          lines: {
            create: totals.calculatedLines.map((l) => ({
              itemId: l.itemId || null,
              deskripsi: l.deskripsi,
              qty: l.qty,
              harga: l.harga,
              diskon: l.diskon,
              ppnRate: l.ppnRate,
              jumlah: l.jumlah,
              warehouseId: l.warehouseId || null,
              dimensions: l.dimensions || null,
            })),
          },
        },
        include: {
          partner: true,
          lines: { include: { item: true, warehouse: true } },
        },
      });
    });
  }

  async confirmOpen(tenantId: string, id: string) {
    const po = await this.findById(tenantId, id);
    if (po.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(`Pesanan Pembelian sudah berstatus ${po.status}.`);
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: OrderStatus.OPEN },
      include: { partner: true, lines: true },
    });
  }

  async cancel(tenantId: string, id: string, alasan?: string, user?: any) {
    const po = await this.findById(tenantId, id);

    if (po.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Pesanan Pembelian sudah dibatalkan.');
    }

    // Cek apakah sudah ada barang yang diterima atau ditagih
    const hasReceivedOrBilled = po.lines.some(
      (l) => Number(l.qtyDiterima) > 0 || Number(l.qtyDitagih) > 0,
    );

    if (hasReceivedOrBilled) {
      throw new BadRequestException(
        'Pesanan Pembelian (PO) tidak dapat dibatalkan karena sudah ada barang yang diterima atau ditagih. Gunakan opsi Tutup Order (Force Close) jika ingin menghentikan sisa pesanan.',
      );
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: user?.userId || user?.id || user?.email || 'SYSTEM',
        catatan: alasan ? `${po.catatan ? po.catatan + ' | ' : ''}Alasan Batal: ${alasan}` : po.catatan,
      },
      include: { partner: true, lines: true },
    });
  }

  async forceClose(tenantId: string, id: string, catatan?: string, user?: any) {
    const po = await this.findById(tenantId, id);

    if (po.status !== OrderStatus.OPEN && po.status !== OrderStatus.PARTIAL) {
      throw new BadRequestException(
        `Hanya pesanan berstatus OPEN atau PARTIAL yang dapat ditutup paksa. Status saat ini: ${po.status}.`,
      );
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: OrderStatus.CLOSED,
        closedAt: new Date(),
        closedBy: user?.userId || user?.id || user?.email || 'SYSTEM',
        catatan: catatan ? `${po.catatan ? po.catatan + ' | ' : ''}Ditutup Manual: ${catatan}` : po.catatan,
      },
      include: { partner: true, lines: true },
    });
  }

  /**
   * Helper untuk memperbarui status pesanan secara otomatis berdasarkan pemenuhan barisnya
   */
  async refreshOrderStatus(tx: Prisma.TransactionClient, poId: string) {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { lines: true },
    });
    if (!po) return;

    if (po.status === OrderStatus.CANCELLED || po.status === OrderStatus.CLOSED) {
      return;
    }

    let allFulfilled = true;
    let anyReceived = false;

    for (const l of po.lines) {
      const qty = Number(l.qty);
      const diterima = Number(l.qtyDiterima);
      if (diterima > 0) anyReceived = true;
      if (diterima < qty) allFulfilled = false;
    }

    let newStatus: OrderStatus = OrderStatus.OPEN;
    if (allFulfilled) {
      newStatus = OrderStatus.COMPLETED;
    } else if (anyReceived) {
      newStatus = OrderStatus.PARTIAL;
    }

    if (po.status !== newStatus && po.status !== OrderStatus.DRAFT) {
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: newStatus },
      });
    }
  }
}

