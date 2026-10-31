import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentNumberingService } from '../../subledger/document-numbering.service';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
  CreateDeliveryOrderFromSoDto,
  CreateInvoiceFromSoDto,
} from '../dto/sales-order.dto';
import { OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class SalesOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNumbering: DocumentNumberingService,
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
        'Modul Inventory wajib aktif untuk menggunakan fitur Order Management.',
      );
    }
    if (!setting.arEnabled) {
      throw new BadRequestException(
        'Modul AR (Piutang) wajib aktif untuk membuat Pesanan Penjualan (SO).',
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

  async getStockAvailability(tenantId: string, itemId: string, warehouseId?: string) {
    // Saldo fisik On Hand
    const balanceWhere: Prisma.StockBalanceWhereInput = { tenantId, itemId };
    if (warehouseId) balanceWhere.warehouseId = warehouseId;

    const balances = await this.prisma.stockBalance.findMany({
      where: balanceWhere,
    });
    const onHand = balances.reduce((sum, b) => sum + Number(b.qty || 0), 0);

    // Kuantitas terpesan (Open SO lines yang belum terkirim)
    const soLineWhere: Prisma.SalesOrderLineWhereInput = {
      itemId,
      so: {
        tenantId,
        status: { in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
      },
    };
    if (warehouseId) soLineWhere.warehouseId = warehouseId;

    const openSoLines = await this.prisma.salesOrderLine.findMany({
      where: soLineWhere,
    });

    const ordered = openSoLines.reduce((sum, l) => {
      const unfulfilled = Math.max(0, Number(l.qty) - Number(l.qtyDikirim));
      return sum + unfulfilled;
    }, 0);

    const available = onHand - ordered;

    return {
      itemId,
      warehouseId: warehouseId || null,
      onHand,
      ordered,
      available,
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
    const where: Prisma.SalesOrderWhereInput = { tenantId };

    if (query?.status && query.status !== 'ALL') {
      where.status = query.status as OrderStatus;
    }
    if (query?.partnerId) where.partnerId = query.partnerId;
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

    return this.prisma.salesOrder.findMany({
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
    const so = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: {
        partner: true,
        lines: {
          include: {
            item: true,
            warehouse: true,
          },
        },
        deliveries: {
          include: {
            warehouse: true,
            lines: true,
          },
        },
      },
    });

    if (!so) {
      throw new NotFoundException(`Pesanan Penjualan (SO) dengan ID "${id}" tidak ditemukan.`);
    }

    return so;
  }

  async create(tenantId: string, dto: CreateSalesOrderDto, user?: any) {
    await this.ensureOrderManagementEnabled(tenantId);

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.salesOrder.findUnique({
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
    if (!partner.isActive) {
      throw new BadRequestException(`Pelanggan "${partner.nama}" sedang tidak aktif.`);
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const mataUang = dto.mata_uang || partner.mata_uang || tenant?.mata_uang || 'IDR';
    const kurs = dto.kurs || 1;

    const noDokumen = await this.docNumbering.generateNextNumber(tenantId, 'SALES_ORDER', 'SO');
    const totals = this.calculateTotals(dto.lines);

    const initialStatus = dto.status === OrderStatus.OPEN ? OrderStatus.OPEN : OrderStatus.DRAFT;

    return this.prisma.salesOrder.create({
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

  async update(tenantId: string, id: string, dto: UpdateSalesOrderDto) {
    const so = await this.findById(tenantId, id);

    if (so.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        `Pesanan Penjualan berstatus ${so.status}. Hanya status DRAFT yang dapat diedit.`,
      );
    }

    const totals = this.calculateTotals(dto.lines);
    const kurs = dto.kurs || Number(so.kurs);

    return this.prisma.$transaction(async (tx) => {
      await tx.salesOrderLine.deleteMany({ where: { soId: id } });

      return tx.salesOrder.update({
        where: { id },
        data: {
          tanggal: new Date(dto.tanggal),
          tanggalDiharapkan: dto.tanggalDiharapkan ? new Date(dto.tanggalDiharapkan) : null,
          partnerId: dto.partnerId,
          mata_uang: dto.mata_uang || so.mata_uang,
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
    const so = await this.findById(tenantId, id);
    if (so.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(`Pesanan Penjualan sudah berstatus ${so.status}.`);
    }

    return this.prisma.salesOrder.update({
      where: { id },
      data: { status: OrderStatus.OPEN },
      include: { partner: true, lines: true },
    });
  }

  async cancel(tenantId: string, id: string, alasan?: string, user?: any) {
    const so = await this.findById(tenantId, id);

    if (so.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Pesanan Penjualan sudah dibatalkan.');
    }

    const hasDeliveredOrBilled = so.lines.some(
      (l) => Number(l.qtyDikirim) > 0 || Number(l.qtyDitagih) > 0,
    );

    if (hasDeliveredOrBilled) {
      throw new BadRequestException(
        'Pesanan Penjualan (SO) tidak dapat dibatalkan karena sudah ada barang yang dikirim atau ditagih. Gunakan opsi Tutup Order (Force Close) jika ingin menghentikan sisa pesanan.',
      );
    }

    return this.prisma.salesOrder.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: user?.userId || user?.id || user?.email || 'SYSTEM',
        catatan: alasan ? `${so.catatan ? so.catatan + ' | ' : ''}Alasan Batal: ${alasan}` : so.catatan,
      },
      include: { partner: true, lines: true },
    });
  }

  async forceClose(tenantId: string, id: string, catatan?: string, user?: any) {
    const so = await this.findById(tenantId, id);

    if (so.status !== OrderStatus.OPEN && so.status !== OrderStatus.PARTIAL) {
      throw new BadRequestException(
        `Hanya pesanan berstatus OPEN atau PARTIAL yang dapat ditutup paksa. Status saat ini: ${so.status}.`,
      );
    }

    return this.prisma.salesOrder.update({
      where: { id },
      data: {
        status: OrderStatus.CLOSED,
        closedAt: new Date(),
        closedBy: user?.userId || user?.id || user?.email || 'SYSTEM',
        catatan: catatan ? `${so.catatan ? so.catatan + ' | ' : ''}Ditutup Manual: ${catatan}` : so.catatan,
      },
      include: { partner: true, lines: true },
    });
  }

  async refreshOrderStatus(tx: Prisma.TransactionClient, soId: string) {
    const so = await tx.salesOrder.findUnique({
      where: { id: soId },
      include: { lines: true },
    });
    if (!so) return;

    if (so.status === OrderStatus.CANCELLED || so.status === OrderStatus.CLOSED) {
      return;
    }

    let allFulfilled = true;
    let anyDelivered = false;

    for (const l of so.lines) {
      const qty = Number(l.qty);
      const dikirim = Number(l.qtyDikirim);
      if (dikirim > 0) anyDelivered = true;
      if (dikirim < qty) allFulfilled = false;
    }

    let newStatus: OrderStatus = OrderStatus.OPEN;
    if (allFulfilled) {
      newStatus = OrderStatus.COMPLETED;
    } else if (anyDelivered) {
      newStatus = OrderStatus.PARTIAL;
    }

    if (so.status !== newStatus && so.status !== OrderStatus.DRAFT) {
      await tx.salesOrder.update({
        where: { id: soId },
        data: { status: newStatus },
      });
    }
  }
}

