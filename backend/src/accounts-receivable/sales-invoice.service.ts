import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { DefaultInventoryIssueService } from './inventory-issue.service';
import {
  CreateSalesInvoiceDto,
  UpdateSalesInvoiceDto,
} from './dto/sales-invoice.dto';
import {
  SalesInvoiceStatus,
  CreditLimitMode,
  PostingSetupKey,
} from '@prisma/client';

@Injectable()
export class SalesInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly accountingPeriodService: AccountingPeriodService,
    private readonly inventoryIssueService: DefaultInventoryIssueService,
  ) {}

  /**
   * Helper untuk menghitung total baris dan total invoice
   */
  private calculateTotals(lines: any[], kurs: number) {
    let subtotal = 0;
    let totalDiskon = 0;
    let totalPpn = 0;

    const calculatedLines = lines.map((l) => {
      const qty = Number(l.qty || 1);
      const hargaSatuan = Number(l.hargaSatuan || 0);
      const diskon = Number(l.diskon || 0);
      const ppnRate = Number(l.ppnRate || 0);

      const lineSubtotal = qty * hargaSatuan;
      const dpp = Math.max(0, lineSubtotal - diskon);
      const linePpn = (dpp * ppnRate) / 100;
      const jumlah = dpp + linePpn;

      subtotal += lineSubtotal;
      totalDiskon += diskon;
      totalPpn += linePpn;

      return {
        ...l,
        qty,
        hargaSatuan,
        diskon,
        ppnRate,
        jumlah,
      };
    });

    const total = subtotal - totalDiskon + totalPpn;
    const subtotalFungsional = subtotal * kurs;
    const totalDiskonFungsional = totalDiskon * kurs;
    const totalPpnFungsional = totalPpn * kurs;
    const totalFungsional = total * kurs;

    return {
      subtotal,
      totalDiskon,
      totalPpn,
      total,
      subtotalFungsional,
      totalDiskonFungsional,
      totalPpnFungsional,
      totalFungsional,
      calculatedLines,
    };
  }

  /**
   * Mengambil mapping akun dari PostingSetup
   */
  private async getPostingAccount(
    tenantId: string,
    key: PostingSetupKey,
    groupCode?: string,
  ) {
    if (groupCode) {
      const override = await this.prisma.postingSetup.findFirst({
        where: { tenantId, key, groupCode },
        include: { account: true },
      });
      if (override) return override.account;
    }

    const defaultSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key, groupCode: null },
      include: { account: true },
    });

    return defaultSetup?.account || null;
  }

  /**
   * Validasi limit kredit pelanggan
   */
  private async checkCreditLimit(
    tenantId: string,
    partnerId: string,
    newInvoiceTotalFungsional: number,
  ) {
    const partner = await this.prisma.businessPartner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException('Pelanggan (Business Partner) tidak ditemukan');
    }

    if (!partner.isCustomer) {
      throw new BadRequestException(
        `Mitra bisnis '${partner.nama}' (${partner.kode}) bukan merupakan Pelanggan (Customer).`,
      );
    }

    if (!partner.isActive) {
      throw new BadRequestException(
        `Mitra bisnis '${partner.nama}' (${partner.kode}) sedang tidak aktif.`,
      );
    }

    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    if (partner.creditLimit && Number(partner.creditLimit) > 0) {
      const outstandingAgg = await this.prisma.salesInvoice.aggregate({
        where: {
          tenantId,
          partnerId,
          status: { in: [SalesInvoiceStatus.POSTED, SalesInvoiceStatus.PARTIAL] },
        },
        _sum: { saldoFungsional: true },
      });

      const currentAR = Number(outstandingAgg._sum.saldoFungsional || 0);
      const projectedAR = currentAR + newInvoiceTotalFungsional;

      if (projectedAR > Number(partner.creditLimit)) {
        if (setting?.creditLimitMode === CreditLimitMode.BLOCK) {
          throw new BadRequestException(
            `Batas limit kredit pelanggan '${partner.nama}' terlampaui. Limit: ${partner.creditLimit}, Total Piutang setelah faktur ini: ${projectedAR}. Pembuatan/posting faktur diblokir.`,
          );
        }
      }
    }

    return partner;
  }

  /**
   * Membuat draft faktur penjualan
   */
  async createDraft(
    tenantId: string,
    dto: CreateSalesInvoiceDto,
    userName?: string,
  ) {
    // Dukungan Idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.salesInvoice.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: { lines: true, partner: true },
      });
      if (existing) {
        return existing;
      }
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    const mataUang = dto.mata_uang || tenant?.mata_uang || 'IDR';
    const kurs = dto.kurs || 1;

    const totals = this.calculateTotals(dto.lines, kurs);
    await this.checkCreditLimit(tenantId, dto.partnerId, totals.totalFungsional);

    const noDokumen = await this.documentNumberingService.generateNextNumber(
      tenantId,
      'SALES_INVOICE',
      'INV',
    );

    return await this.prisma.salesInvoice.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        jatuhTempo: new Date(dto.jatuhTempo),
        partnerId: dto.partnerId,
        mata_uang: mataUang,
        kurs,
        status: SalesInvoiceStatus.DRAFT,
        subtotal: totals.subtotal,
        totalDiskon: totals.totalDiskon,
        totalPpn: totals.totalPpn,
        total: totals.total,
        totalDialokasikan: 0,
        saldo: totals.total,
        subtotalFungsional: totals.subtotalFungsional,
        totalDiskonFungsional: totals.totalDiskonFungsional,
        totalPpnFungsional: totals.totalPpnFungsional,
        totalFungsional: totals.totalFungsional,
        saldoFungsional: totals.totalFungsional,
        catatan: dto.catatan,
        externalRef: dto.externalRef,
        idempotencyKey: dto.idempotencyKey,
        createdBy: userName || 'SYSTEM',
        lines: {
          create: totals.calculatedLines.map((l) => ({
            itemId: l.itemId || null,
            warehouseId: l.warehouseId || null,
            itemType: l.itemType || 'SERVICE',
            deskripsi: l.deskripsi,
            qty: l.qty,
            hargaSatuan: l.hargaSatuan,
            diskon: l.diskon,
            ppnRate: l.ppnRate,
            jumlah: l.jumlah,
            akunPendapatanId: l.akunPendapatanId || null,
            dimensions: l.dimensions || null,
            sourceLineType: l.sourceLineType || null,
            sourceLineId: l.sourceLineId || null,
          })),
        },
      },
      include: {
        lines: true,
        partner: true,
      },
    });
  }

  /**
   * Mengubah faktur berstatus DRAFT
   */
  async updateDraft(
    tenantId: string,
    id: string,
    dto: UpdateSalesInvoiceDto,
  ) {
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Faktur penjualan tidak ditemukan');
    }

    if (invoice.status !== SalesInvoiceStatus.DRAFT) {
      throw new BadRequestException('Hanya faktur berstatus DRAFT yang dapat diedit');
    }

    const kurs = dto.kurs || Number(invoice.kurs);
    const totals = this.calculateTotals(dto.lines, kurs);
    await this.checkCreditLimit(tenantId, dto.partnerId, totals.totalFungsional);

    return await this.prisma.$transaction(async (tx) => {
      await tx.salesInvoiceLine.deleteMany({
        where: { invoiceId: id },
      });

      return await tx.salesInvoice.update({
        where: { id },
        data: {
          tanggal: new Date(dto.tanggal),
          jatuhTempo: new Date(dto.jatuhTempo),
          partnerId: dto.partnerId,
          mata_uang: dto.mata_uang || invoice.mata_uang,
          kurs,
          subtotal: totals.subtotal,
          totalDiskon: totals.totalDiskon,
          totalPpn: totals.totalPpn,
          total: totals.total,
          saldo: totals.total,
          subtotalFungsional: totals.subtotalFungsional,
          totalDiskonFungsional: totals.totalDiskonFungsional,
          totalPpnFungsional: totals.totalPpnFungsional,
          totalFungsional: totals.totalFungsional,
          saldoFungsional: totals.totalFungsional,
          catatan: dto.catatan,
          externalRef: dto.externalRef,
          lines: {
            create: totals.calculatedLines.map((l) => ({
              itemId: l.itemId || null,
              warehouseId: l.warehouseId || null,
              itemType: l.itemType || 'SERVICE',
              deskripsi: l.deskripsi,
              qty: l.qty,
              hargaSatuan: l.hargaSatuan,
              diskon: l.diskon,
              ppnRate: l.ppnRate,
              jumlah: l.jumlah,
              akunPendapatanId: l.akunPendapatanId || null,
              dimensions: l.dimensions || null,
              sourceLineType: l.sourceLineType || null,
              sourceLineId: l.sourceLineId || null,
            })),
          },
        },
        include: {
          lines: true,
          partner: true,
        },
      });
    });
  }

  /**
   * Menghapus faktur berstatus DRAFT
   */
  async deleteDraft(tenantId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id },
    });

    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Faktur penjualan tidak ditemukan');
    }

    if (invoice.status !== SalesInvoiceStatus.DRAFT) {
      throw new BadRequestException('Hanya faktur berstatus DRAFT yang dapat dihapus');
    }

    return await this.prisma.salesInvoice.delete({
      where: { id },
    });
  }

  /**
   * Memposting Faktur Penjualan ke GL via SubledgerPostingService
   */
  async postInvoice(tenantId: string, id: string, user?: any) {
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            akunPendapatan: true,
          },
        },
        partner: true,
      },
    });

    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Faktur penjualan tidak ditemukan');
    }

    if (invoice.status !== SalesInvoiceStatus.DRAFT) {
      throw new BadRequestException(`Faktur sudah diposting atau dibatalkan (Status: ${invoice.status})`);
    }

    // 1. Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(invoice.tanggal),
    );

    // 2. Ambil Konfigurasi Akun dari PostingSetup
    const groupCode = invoice.partner.groupCode || undefined;
    const arControl = await this.getPostingAccount(tenantId, 'AR_CONTROL', groupCode);
    const defaultSalesRevenue = await this.getPostingAccount(tenantId, 'SALES_REVENUE', groupCode);
    const salesDiscount = await this.getPostingAccount(tenantId, 'SALES_DISCOUNT', groupCode);
    const ppnKeluaran = await this.getPostingAccount(tenantId, 'PPN_KELUARAN', groupCode);
    const cogsAccount = await this.getPostingAccount(tenantId, 'COGS', groupCode);
    const inventoryAccount = await this.getPostingAccount(tenantId, 'INVENTORY', groupCode);

    if (!arControl) {
      throw new BadRequestException(
        'Akun kontrol Piutang (AR_CONTROL) belum dipetakan di Posting Setup Subledger.',
      );
    }
    if (!defaultSalesRevenue) {
      throw new BadRequestException(
        'Akun Pendapatan Penjualan (SALES_REVENUE) belum dipetakan di Posting Setup Subledger.',
      );
    }

    const total = Number(invoice.total);
    const totalDiskon = Number(invoice.totalDiskon);
    const totalPpn = Number(invoice.totalPpn);

    // 3. Tangani Baris Barang Bertipe STOK
    let totalCogs = 0;
    for (const line of invoice.lines) {
      if (line.itemType === 'STOCK' && line.itemId) {
        // Jika terhubung ke DO_LINE, stok sudah dikeluarkan saat DO di-post
        if (line.sourceLineType === 'DO_LINE') {
          continue;
        }

        const issueResult = await this.inventoryIssueService.issueStockForInvoice(
          tenantId,
          {
            invoiceId: invoice.id,
            itemId: line.itemId,
            warehouseId: line.warehouseId || undefined,
            qty: Number(line.qty),
            tanggal: invoice.tanggal,
          },
        );
        totalCogs += issueResult.cogsAmount;
      }
    }

    // 4. Susun Baris Jurnal Subledger
    const entries: any[] = [];

    // Dr Piutang Usaha = Total Invoice
    entries.push({
      kode_akun: arControl.kode_akun,
      tipe: 'DEBIT',
      jumlah: total,
    });

    // Dr Potongan Penjualan (jika ada diskon)
    if (totalDiskon > 0) {
      if (!salesDiscount) {
        throw new BadRequestException(
          'Akun Potongan Penjualan (SALES_DISCOUNT) belum dipetakan di Posting Setup Subledger.',
        );
      }
      entries.push({
        kode_akun: salesDiscount.kode_akun,
        tipe: 'DEBIT',
        jumlah: totalDiskon,
      });
    }

    // Cr Pendapatan Penjualan per baris (dengan Dimensions)
    for (const line of invoice.lines) {
      const revenueAcc = line.akunPendapatan || defaultSalesRevenue;
      const lineGross = Number(line.qty) * Number(line.hargaSatuan);
      const dims = Array.isArray(line.dimensions) ? line.dimensions : undefined;

      entries.push({
        kode_akun: revenueAcc.kode_akun,
        tipe: 'KREDIT',
        jumlah: lineGross,
        dimensions: dims,
      });
    }

    // Cr PPN Keluaran (jika ada PPN)
    if (totalPpn > 0) {
      if (!ppnKeluaran) {
        throw new BadRequestException(
          'Akun PPN Keluaran (PPN_KELUARAN) belum dipetakan di Posting Setup Subledger.',
        );
      }
      entries.push({
        kode_akun: ppnKeluaran.kode_akun,
        tipe: 'KREDIT',
        jumlah: totalPpn,
      });
    }

    // Dr HPP / Cr Persediaan (jika ada baris stok)
    if (totalCogs > 0) {
      if (!cogsAccount || !inventoryAccount) {
        throw new BadRequestException(
          'Akun COGS atau INVENTORY belum dipetakan di Posting Setup Subledger untuk pengeluaran barang stok.',
        );
      }
      entries.push({
        kode_akun: cogsAccount.kode_akun,
        tipe: 'DEBIT',
        jumlah: totalCogs,
      });
      entries.push({
        kode_akun: inventoryAccount.kode_akun,
        tipe: 'KREDIT',
        jumlah: totalCogs,
      });
    }

    // 5. Eksekusi Posting Jurnal GL
    const tanggalStr =
      invoice.tanggal instanceof Date
        ? invoice.tanggal.toISOString().slice(0, 10)
        : String(invoice.tanggal).slice(0, 10);

    const journal = await this.subledgerPostingService.postSubledgerJournal(
      tenantId,
      {
        tanggal: tanggalStr,
        deskripsi: `Faktur Penjualan ${invoice.noDokumen} - ${invoice.partner.nama}`,
        sumber_aplikasi: 'SUBLEDGER-AR',
        sourceDocType: 'SALES_INVOICE',
        sourceDocId: invoice.id,
        no_voucher: invoice.noDokumen,
        mata_uang: invoice.mata_uang,
        entries,
      },
    );

    // 6. Update Status Faktur menjadi POSTED dan perbarui qtyDitagih pada Surat Jalan / SO jika ada
    for (const line of invoice.lines) {
      if (line.sourceLineType === 'DO_LINE' && line.sourceLineId) {
        const doLine = await this.prisma.deliveryOrderLine.findUnique({
          where: { id: line.sourceLineId },
        });
        if (doLine) {
          await this.prisma.deliveryOrderLine.update({
            where: { id: doLine.id },
            data: { qtyDitagih: { increment: Number(line.qty) } },
          });
          if (doLine.soLineId) {
            await this.prisma.salesOrderLine.update({
              where: { id: doLine.soLineId },
              data: { qtyDitagih: { increment: Number(line.qty) } },
            });
          }
        }
      }
    }

    return await this.prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: {
        status: SalesInvoiceStatus.POSTED,
        journalId: journal.id,
        postedAt: new Date(),
        postedBy: user?.userId || user?.id || user?.email || 'SYSTEM',
      },
      include: {
        lines: true,
        partner: true,
        journal: true,
      },
    });
  }

  /**
   * Membatalkan / Void Faktur Penjualan
   */
  async voidInvoice(tenantId: string, id: string, alasan?: string, user?: any) {
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: { allocations: true, lines: true },
    });

    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Faktur penjualan tidak ditemukan');
    }

    if (invoice.status === SalesInvoiceStatus.VOID) {
      throw new BadRequestException('Faktur ini sudah berstatus VOID');
    }

    if (invoice.status === SalesInvoiceStatus.DRAFT) {
      return await this.prisma.salesInvoice.update({
        where: { id },
        data: { status: SalesInvoiceStatus.VOID },
      });
    }

    // Periksa apakah ada alokasi pembayaran
    if (Number(invoice.totalDialokasikan || 0) > 0 || (invoice.allocations && invoice.allocations.length > 0)) {
      throw new BadRequestException(
        'Faktur tidak dapat di-void karena sudah memiliki pembayaran yang dialokasikan. Batalkan (void) alokasi pembayaran terlebih dahulu.',
      );
    }

    // Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(),
    );

    // Kembalikan qtyDitagih pada baris DO dan SO jika ada
    for (const line of invoice.lines) {
      if (line.sourceLineType === 'DO_LINE' && line.sourceLineId) {
        const doLine = await this.prisma.deliveryOrderLine.findUnique({
          where: { id: line.sourceLineId },
        });
        if (doLine) {
          await this.prisma.deliveryOrderLine.update({
            where: { id: doLine.id },
            data: { qtyDitagih: { decrement: Number(line.qty) } },
          });
          if (doLine.soLineId) {
            await this.prisma.salesOrderLine.update({
              where: { id: doLine.soLineId },
              data: { qtyDitagih: { decrement: Number(line.qty) } },
            });
          }
        }
      }
    }

    let voidJournalId: string | null = null;
    if (invoice.journalId) {
      const reversalJournal = await this.subledgerPostingService.reverseJournal(
        tenantId,
        invoice.journalId,
        new Date().toISOString().slice(0, 10),
        alasan || `Void Faktur Penjualan ${invoice.noDokumen}`,
      );
      voidJournalId = reversalJournal.id;
    }

    return await this.prisma.salesInvoice.update({
      where: { id },
      data: {
        status: SalesInvoiceStatus.VOID,
        voidJournalId,
        saldo: 0,
        saldoFungsional: 0,
        voidedAt: new Date(),
        voidedBy: user?.userId || user?.id || user?.email || 'SYSTEM',
      },
    });
  }

  /**
   * Menampilkan semua faktur dengan filter
   */
  async findAll(
    tenantId: string,
    filters?: {
      status?: SalesInvoiceStatus;
      partnerId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
      externalRef?: string;
    },
  ) {
    const where: any = { tenantId };

    if (filters?.status) where.status = filters.status;
    if (filters?.partnerId) where.partnerId = filters.partnerId;
    if (filters?.externalRef) where.externalRef = filters.externalRef;

    if (filters?.startDate || filters?.endDate) {
      where.tanggal = {};
      if (filters.startDate) where.tanggal.gte = new Date(filters.startDate);
      if (filters.endDate) where.tanggal.lte = new Date(filters.endDate);
    }

    if (filters?.search) {
      const s = filters.search;
      where.OR = [
        { noDokumen: { contains: s, mode: 'insensitive' } },
        { externalRef: { contains: s, mode: 'insensitive' } },
        { partner: { nama: { contains: s, mode: 'insensitive' } } },
        { partner: { kode: { contains: s, mode: 'insensitive' } } },
      ];
    }

    return await this.prisma.salesInvoice.findMany({
      where,
      include: {
        partner: true,
        lines: true,
        journal: {
          select: { id: true, no_voucher: true, status: true },
        },
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  /**
   * Mengambil satu faktur berdasarkan ID
   */
  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        partner: true,
        lines: {
          include: { akunPendapatan: true },
        },
        allocations: {
          include: { receipt: true },
        },
        journal: true,
        voidJournal: true,
      },
    });

    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Faktur penjualan tidak ditemukan');
    }

    return invoice;
  }

  /**
   * Mengambil faktur outstanding (belum lunas) per pelanggan
   */
  async getOutstanding(tenantId: string, partnerId?: string) {
    const where: any = {
      tenantId,
      status: { in: [SalesInvoiceStatus.POSTED, SalesInvoiceStatus.PARTIAL] },
      saldo: { gt: 0 },
    };

    if (partnerId) {
      where.partnerId = partnerId;
    }

    return await this.prisma.salesInvoice.findMany({
      where,
      include: { partner: true },
      orderBy: { jatuhTempo: 'asc' },
    });
  }
}
