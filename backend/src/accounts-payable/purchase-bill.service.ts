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
import { DefaultInventoryReceiptService } from './inventory-receipt.service';
import {
  CreatePurchaseBillDto,
  UpdatePurchaseBillDto,
} from './dto/purchase-bill.dto';
import {
  PurchaseBillStatus,
  PostingSetupKey,
} from '@prisma/client';

@Injectable()
export class PurchaseBillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly accountingPeriodService: AccountingPeriodService,
    private readonly inventoryReceiptService: DefaultInventoryReceiptService,
  ) {}

  /**
   * Helper untuk menghitung total baris dan total tagihan (bill)
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
   * Mengambil pemetaan akun dari PostingSetup
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
   * Membuat tagihan faktur pembelian baru dalam status DRAFT
   */
  async createDraft(
    tenantId: string,
    dto: CreatePurchaseBillDto,
    userName?: string,
  ) {
    // 1. Validasi Mitra Bisnis (Vendor)
    const partner = await this.prisma.businessPartner.findUnique({
      where: { id: dto.partnerId },
    });
    if (!partner || partner.tenantId !== tenantId) {
      throw new NotFoundException('Vendor tidak ditemukan');
    }
    if (!partner.isVendor) {
      throw new BadRequestException('Mitra bisnis yang dipilih bukan berstatus Vendor');
    }

    // 2. Tentukan Mata Uang & Kurs
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const mataUang = dto.mata_uang || partner.mata_uang || tenant?.mata_uang || 'IDR';
    const kurs = Number(dto.kurs || 1.0);

    // 3. Hitung Kalkulasi Nilai
    const totals = this.calculateTotals(dto.lines, kurs);

    // 4. Generate Nomor Dokumen Internal
    const docDate = new Date(dto.tanggal);
    const noDokumen = await this.documentNumberingService.generateNextNumber(
      tenantId,
      'BILL',
      'BILL',
      docDate.getFullYear(),
    );

    return await this.prisma.purchaseBill.create({
      data: {
        tenantId,
        noDokumen,
        noFakturVendor: dto.noFakturVendor || null,
        nomorFakturPajakMasukan: dto.nomorFakturPajakMasukan || null,
        tanggal: docDate,
        jatuhTempo: new Date(dto.jatuhTempo),
        partnerId: dto.partnerId,
        mata_uang: mataUang,
        kurs,
        status: PurchaseBillStatus.DRAFT,
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
            akunBiayaId: l.akunBiayaId || null,
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
   * Mengubah tagihan pembelian berstatus DRAFT
   */
  async updateDraft(
    tenantId: string,
    id: string,
    dto: UpdatePurchaseBillDto,
  ) {
    const bill = await this.prisma.purchaseBill.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!bill || bill.tenantId !== tenantId) {
      throw new NotFoundException('Faktur pembelian tidak ditemukan');
    }

    if (bill.status !== PurchaseBillStatus.DRAFT) {
      throw new BadRequestException('Hanya tagihan pembelian berstatus DRAFT yang dapat diedit');
    }

    const kurs = dto.kurs || Number(bill.kurs);
    const totals = this.calculateTotals(dto.lines, kurs);

    return await this.prisma.$transaction(async (tx) => {
      await tx.purchaseBillLine.deleteMany({
        where: { billId: id },
      });

      return await tx.purchaseBill.update({
        where: { id },
        data: {
          tanggal: new Date(dto.tanggal),
          jatuhTempo: new Date(dto.jatuhTempo),
          partnerId: dto.partnerId,
          noFakturVendor: dto.noFakturVendor || null,
          nomorFakturPajakMasukan: dto.nomorFakturPajakMasukan || null,
          mata_uang: dto.mata_uang || bill.mata_uang,
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
              akunBiayaId: l.akunBiayaId || null,
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
   * Menghapus tagihan pembelian berstatus DRAFT
   */
  async deleteDraft(tenantId: string, id: string) {
    const bill = await this.prisma.purchaseBill.findUnique({
      where: { id },
    });

    if (!bill || bill.tenantId !== tenantId) {
      throw new NotFoundException('Faktur pembelian tidak ditemukan');
    }

    if (bill.status !== PurchaseBillStatus.DRAFT) {
      throw new BadRequestException('Hanya faktur pembelian berstatus DRAFT yang dapat dihapus');
    }

    return await this.prisma.purchaseBill.delete({
      where: { id },
    });
  }

  /**
   * Memposting Faktur Pembelian ke GL via SubledgerPostingService
   */
  async postBill(tenantId: string, id: string) {
    const bill = await this.prisma.purchaseBill.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            akunBiaya: true,
          },
        },
        partner: true,
      },
    });

    if (!bill || bill.tenantId !== tenantId) {
      throw new NotFoundException('Faktur pembelian tidak ditemukan');
    }

    if (bill.status !== PurchaseBillStatus.DRAFT) {
      throw new BadRequestException(`Faktur sudah diposting atau dibatalkan (Status: ${bill.status})`);
    }

    // 1. Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(bill.tanggal),
    );

    // 2. Ambil Pemetaan Akun dari PostingSetup
    const groupCode = bill.partner.groupCode || undefined;
    const apControl = await this.getPostingAccount(tenantId, 'AP_CONTROL', groupCode);
    const defaultPurchaseExpense = await this.getPostingAccount(tenantId, 'PURCHASE_EXPENSE', groupCode);
    const purchaseDiscount = await this.getPostingAccount(tenantId, 'PURCHASE_DISCOUNT', groupCode);
    const ppnMasukan = await this.getPostingAccount(tenantId, 'PPN_MASUKAN', groupCode);
    const inventoryAccount = await this.getPostingAccount(tenantId, 'INVENTORY', groupCode);
    const grIrClearing = await this.getPostingAccount(tenantId, 'GR_IR_CLEARING', groupCode);

    if (!apControl) {
      throw new BadRequestException(
        'Akun kontrol Hutang (AP_CONTROL) belum dipetakan di Posting Setup Subledger.',
      );
    }
    if (!defaultPurchaseExpense) {
      throw new BadRequestException(
        'Akun Beban Pembelian (PURCHASE_EXPENSE) belum dipetakan di Posting Setup Subledger.',
      );
    }

    const total = Number(bill.total);
    const totalDiskon = Number(bill.totalDiskon);
    const totalPpn = Number(bill.totalPpn);

    // 3. Susun Baris Jurnal Subledger
    const entries: any[] = [];
    let nonGrDiskon = 0;

    // Baris Debit: Biaya / Persediaan / GR_IR_CLEARING + PURCHASE_PRICE_VARIANCE
    for (const line of bill.lines) {
      const lineGross = Number(line.qty) * Number(line.hargaSatuan);
      const lineDiskon = Number(line.diskon || 0);
      const lineNet = lineGross - lineDiskon;
      const dims = Array.isArray(line.dimensions) ? line.dimensions : undefined;

      if (line.itemType === 'STOCK' && line.itemId) {
        if (line.sourceLineType === 'GR_LINE' && line.sourceLineId) {
          // Tertaut ke Goods Receipt: persediaan sudah dicatat saat GR, posting Bill mendebit GR_IR_CLEARING
          if (!grIrClearing) {
            throw new BadRequestException(
              'Akun Kliring Barang Diterima Belum Ditagih (GR_IR_CLEARING) belum dipetakan di Posting Setup.',
            );
          }

          const grLine = await this.prisma.goodsReceiptLine.findUnique({
            where: { id: line.sourceLineId },
            include: { receipt: true },
          });

          const qtyBill = Number(line.qty);
          const grBiayaSatuan = grLine ? Number(grLine.biayaSatuan) : Number(line.hargaSatuan);
          const nilaiGrCleared = Math.round(qtyBill * grBiayaSatuan * 100) / 100;

          // Dr GR_IR_CLEARING sebesar nilai GR yang ditagih
          entries.push({
            kode_akun: grIrClearing.kode_akun,
            tipe: 'DEBIT',
            jumlah: nilaiGrCleared,
            dimensions: dims,
          });

          // Selisih antara nilai faktur (net setelah diskon) dan nilai GR yang dikliring -> PPV
          const variance = Math.round((lineNet - nilaiGrCleared) * 100) / 100;
          if (variance !== 0) {
            const ppvAccount = await this.getPostingAccount(tenantId, 'PURCHASE_PRICE_VARIANCE', groupCode);
            if (!ppvAccount) {
              throw new BadRequestException(
                'Akun Selisih Harga Pembelian (PURCHASE_PRICE_VARIANCE) belum dipetakan di Posting Setup Subledger.',
              );
            }

            if (variance > 0) {
              // Faktur lebih mahal -> Dr PPV
              entries.push({
                kode_akun: ppvAccount.kode_akun,
                tipe: 'DEBIT',
                jumlah: variance,
                dimensions: dims,
              });
            } else {
              // Faktur lebih murah -> Cr PPV
              entries.push({
                kode_akun: ppvAccount.kode_akun,
                tipe: 'KREDIT',
                jumlah: Math.abs(variance),
                dimensions: dims,
              });
            }
          }

          // Perbarui qtyDitagih pada GoodsReceiptLine
          await this.prisma.goodsReceiptLine.update({
            where: { id: line.sourceLineId },
            data: { qtyDitagih: { increment: qtyBill } },
          });

          // Perbarui qtyDitagih pada PurchaseOrderLine jika ada
          if (grLine?.poLineId) {
            await this.prisma.purchaseOrderLine.update({
              where: { id: grLine.poLineId },
              data: { qtyDitagih: { increment: qtyBill } },
            });
          }
        } else {
          // Pembelian stok langsung: debit Akun Persediaan dan tambahkan ke kartu stok via inventoryReceiptService
          if (!inventoryAccount) {
            throw new BadRequestException(
              'Akun Persediaan (INVENTORY) belum dipetakan di Posting Setup Subledger untuk pembelian barang stok.',
            );
          }
          await this.inventoryReceiptService.receiveStockForBill(tenantId, {
            billId: bill.id,
            itemId: line.itemId,
            warehouseId: line.warehouseId || undefined,
            qty: Number(line.qty),
            nilaiMasuk: lineGross - lineDiskon,
            tanggal: new Date(bill.tanggal),
          });

          entries.push({
            kode_akun: inventoryAccount.kode_akun,
            tipe: 'DEBIT',
            jumlah: lineGross,
            dimensions: dims,
          });

          nonGrDiskon += lineDiskon;
        }
      } else {
        // Non-stok (jasa / beban operasional)
        const expenseAcc = line.akunBiaya || defaultPurchaseExpense;
        entries.push({
          kode_akun: expenseAcc.kode_akun,
          tipe: 'DEBIT',
          jumlah: lineGross,
          dimensions: dims,
        });

        nonGrDiskon += lineDiskon;
      }
    }

    // Dr PPN Masukan (jika ada PPN)
    if (totalPpn > 0) {
      if (!ppnMasukan) {
        throw new BadRequestException(
          'Akun PPN Masukan (PPN_MASUKAN) belum dipetakan di Posting Setup Subledger.',
        );
      }
      entries.push({
        kode_akun: ppnMasukan.kode_akun,
        tipe: 'DEBIT',
        jumlah: totalPpn,
      });
    }

    // Cr Potongan Pembelian (khusus baris non-GR yang diskonnya belum difaktorkan ke PPV)
    if (nonGrDiskon > 0) {
      if (!purchaseDiscount) {
        throw new BadRequestException(
          'Akun Potongan Pembelian (PURCHASE_DISCOUNT) belum dipetakan di Posting Setup Subledger.',
        );
      }
      entries.push({
        kode_akun: purchaseDiscount.kode_akun,
        tipe: 'KREDIT',
        jumlah: nonGrDiskon,
      });
    }

    // Cr Hutang Usaha = Total Tagihan
    entries.push({
      kode_akun: apControl.kode_akun,
      tipe: 'KREDIT',
      jumlah: total,
    });

    // 4. Eksekusi Posting Jurnal GL
    const tanggalStr =
      bill.tanggal instanceof Date
        ? bill.tanggal.toISOString().slice(0, 10)
        : String(bill.tanggal).slice(0, 10);

    const journal = await this.subledgerPostingService.postSubledgerJournal(
      tenantId,
      {
        tanggal: tanggalStr,
        deskripsi: `Faktur Pembelian ${bill.noDokumen} - ${bill.partner.nama}${bill.noFakturVendor ? ` (No. Faktur Vendor: ${bill.noFakturVendor})` : ''}`,
        sumber_aplikasi: 'SUBLEDGER-AP',
        sourceDocType: 'PURCHASE_BILL',
        sourceDocId: bill.id,
        no_voucher: bill.noDokumen,
        mata_uang: bill.mata_uang,
        entries,
      },
    );

    // 5. Update Status Faktur Pembelian Menjadi POSTED
    return await this.prisma.purchaseBill.update({
      where: { id: bill.id },
      data: {
        status: PurchaseBillStatus.POSTED,
        journalId: journal.id,
        postedAt: new Date(),
      },
      include: {
        lines: true,
        partner: true,
        journal: true,
      },
    });
  }

  /**
   * Membatalkan faktur pembelian (Void)
   */
  async voidBill(tenantId: string, id: string, alasan: string) {
    const bill = await this.prisma.purchaseBill.findUnique({
      where: { id },
      include: {
        allocations: true,
        lines: true,
      },
    });

    if (!bill || bill.tenantId !== tenantId) {
      throw new NotFoundException('Faktur pembelian tidak ditemukan');
    }

    if (bill.status !== PurchaseBillStatus.POSTED) {
      throw new BadRequestException(
        `Hanya faktur berstatus POSTED yang dapat dibatalkan (Status saat ini: ${bill.status})`,
      );
    }

    // Validasi: Tidak boleh void jika sudah ada pembayaran yang dialokasikan
    if (Number(bill.totalDialokasikan) > 0 || bill.allocations.length > 0) {
      throw new BadRequestException(
        'Faktur pembelian tidak dapat dibatalkan karena sudah memiliki alokasi pembayaran. Batalkan pembayaran terlebih dahulu.',
      );
    }

    // Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(),
    );

    // Kembalikan qtyDitagih pada baris GR dan PO jika ada
    for (const line of bill.lines) {
      if (line.sourceLineType === 'GR_LINE' && line.sourceLineId) {
        const grLine = await this.prisma.goodsReceiptLine.findUnique({
          where: { id: line.sourceLineId },
        });
        if (grLine) {
          await this.prisma.goodsReceiptLine.update({
            where: { id: grLine.id },
            data: { qtyDitagih: { decrement: Number(line.qty) } },
          });
          if (grLine.poLineId) {
            await this.prisma.purchaseOrderLine.update({
              where: { id: grLine.poLineId },
              data: { qtyDitagih: { decrement: Number(line.qty) } },
            });
          }
        }
      }
    }

    // Buat Jurnal Pembalik jika memiliki jurnal GL
    let voidJournalId: string | null = null;
    if (bill.journalId) {
      const rev = await this.subledgerPostingService.reverseJournal(
        tenantId,
        bill.journalId,
        new Date().toISOString().slice(0, 10),
        `Pembatalan Faktur Pembelian ${bill.noDokumen}: ${alasan}`,
      );
      voidJournalId = rev.id;
    }

    return await this.prisma.purchaseBill.update({
      where: { id },
      data: {
        status: PurchaseBillStatus.VOID,
        voidJournalId,
      },
    });
  }

  /**
   * Membuat sekaligus memposting faktur pembelian (Dipakai oleh API V1)
   */
  async createAndPostBill(
    tenantId: string,
    dto: CreatePurchaseBillDto,
    userName?: string,
    idempotencyKey?: string,
    externalRef?: string,
  ) {
    const key = idempotencyKey || dto.idempotencyKey;
    if (key) {
      const existing = await this.prisma.purchaseBill.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: key,
          },
        },
        include: { lines: true, partner: true, journal: true },
      });

      if (existing) {
        return existing;
      }
    }

    const draft = await this.createDraft(
      tenantId,
      {
        ...dto,
        idempotencyKey: key,
        externalRef: externalRef || dto.externalRef,
      },
      userName,
    );

    return await this.postBill(tenantId, draft.id);
  }

  /**
   * Mengambil daftar faktur pembelian per tenant
   */
  async findAllBills(
    tenantId: string,
    query?: {
      status?: PurchaseBillStatus;
      partnerId?: string;
      externalRef?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: any = { tenantId };

    if (query?.status) where.status = query.status;
    if (query?.partnerId) where.partnerId = query.partnerId;
    if (query?.externalRef) where.externalRef = query.externalRef;
    if (query?.startDate || query?.endDate) {
      where.tanggal = {};
      if (query.startDate) where.tanggal.gte = new Date(query.startDate);
      if (query.endDate) where.tanggal.lte = new Date(query.endDate);
    }

    return await this.prisma.purchaseBill.findMany({
      where,
      include: {
        partner: true,
        lines: true,
        journal: true,
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  /**
   * Mengambil satu faktur pembelian berdasarkan ID
   */
  async getBillById(tenantId: string, id: string) {
    const bill = await this.prisma.purchaseBill.findUnique({
      where: { id },
      include: {
        partner: true,
        lines: {
          include: {
            akunBiaya: true,
          },
        },
        journal: {
          include: {
            entries: {
              include: {
                chartOfAccount: true,
              },
            },
          },
        },
        voidJournal: true,
        allocations: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!bill || bill.tenantId !== tenantId) {
      throw new NotFoundException('Faktur pembelian tidak ditemukan');
    }

    return bill;
  }

  /**
   * Mengambil faktur pembelian outstanding (belum lunas) per vendor
   */
  async findOutstandingBills(tenantId: string, partnerId?: string) {
    const where: any = {
      tenantId,
      status: {
        in: [PurchaseBillStatus.POSTED, PurchaseBillStatus.PARTIAL],
      },
      saldo: {
        gt: 0,
      },
    };

    if (partnerId) {
      where.partnerId = partnerId;
    }

    return await this.prisma.purchaseBill.findMany({
      where,
      include: {
        partner: true,
      },
      orderBy: { jatuhTempo: 'asc' },
    });
  }
}
