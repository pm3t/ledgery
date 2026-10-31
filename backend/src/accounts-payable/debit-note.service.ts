import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { DefaultInventoryReceiptService } from './inventory-receipt.service';
import { CreateDebitNoteDto } from './dto/debit-note.dto';
import { DebitNoteStatus, PostingSetupKey } from '@prisma/client';

@Injectable()
export class DebitNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly accountingPeriodService: AccountingPeriodService,
    private readonly inventoryReceiptService: DefaultInventoryReceiptService,
  ) {}

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
   * Membuat dan memposting Nota Debit (Retur Pembelian / Koreksi Hutang)
   */
  async createAndPostDebitNote(
    tenantId: string,
    dto: CreateDebitNoteDto,
    userName?: string,
  ) {
    // 1. Dukungan Idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.debitNote.findUnique({
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

    // 2. Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(dto.tanggal),
    );

    // 3. Validasi Vendor
    const partner = await this.prisma.businessPartner.findUnique({
      where: { id: dto.partnerId },
    });
    if (!partner || partner.tenantId !== tenantId) {
      throw new NotFoundException('Vendor tidak ditemukan');
    }

    // 4. Validasi Faktur Asal jika diisi
    if (dto.billId) {
      const bill = await this.prisma.purchaseBill.findUnique({
        where: { id: dto.billId },
      });
      if (!bill || bill.tenantId !== tenantId) {
        throw new NotFoundException('Faktur pembelian asal tidak ditemukan');
      }
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const mataUang = dto.mata_uang || partner.mata_uang || tenant?.mata_uang || 'IDR';
    const kurs = Number(dto.kurs || 1.0);
    const totals = this.calculateTotals(dto.lines, kurs);

    // 5. Generate Nomor Dokumen
    const docDate = new Date(dto.tanggal);
    const noDokumen = await this.documentNumberingService.generateNextNumber(
      tenantId,
      'AP_DEBIT_NOTE',
      'DN',
      docDate.getFullYear(),
    );

    // 6. Tangani Pengembalian Stok (jika returnStock = true)
    if (dto.returnStock) {
      for (const line of dto.lines) {
        if (line.itemType === 'STOCK' && line.itemId) {
          await this.inventoryReceiptService.returnStockForDebitNote(tenantId, {
            debitNoteId: noDokumen,
            itemId: line.itemId,
            qty: Number(line.qty),
            tanggal: docDate,
          });
        }
      }
    }

    // 7. Ambil Akun-Akun dari PostingSetup
    const groupCode = partner.groupCode || undefined;
    const apControl = await this.getPostingAccount(tenantId, 'AP_CONTROL', groupCode);
    const defaultPurchaseExpense = await this.getPostingAccount(tenantId, 'PURCHASE_EXPENSE', groupCode);
    const purchaseDiscount = await this.getPostingAccount(tenantId, 'PURCHASE_DISCOUNT', groupCode);
    const ppnMasukan = await this.getPostingAccount(tenantId, 'PPN_MASUKAN', groupCode);
    const inventoryAccount = await this.getPostingAccount(tenantId, 'INVENTORY', groupCode);

    if (!apControl) {
      throw new BadRequestException('Akun kontrol Hutang (AP_CONTROL) belum dipetakan.');
    }
    if (!defaultPurchaseExpense) {
      throw new BadRequestException('Akun Beban Pembelian (PURCHASE_EXPENSE) belum dipetakan.');
    }

    // 8. Susun Jurnal Kebalikan Faktur
    // Dr Hutang Usaha (AP_CONTROL) = Total Nota Debit
    // Dr Potongan Pembelian (jika ada diskon)
    // Cr Beban Pembelian / Cr Persediaan per baris
    // Cr PPN Masukan
    const entries: any[] = [];

    // Dr Hutang Usaha
    entries.push({
      kode_akun: apControl.kode_akun,
      tipe: 'DEBIT',
      jumlah: totals.total,
    });

    // Dr Potongan Pembelian
    if (totals.totalDiskon > 0) {
      if (!purchaseDiscount) {
        throw new BadRequestException('Akun Potongan Pembelian belum dipetakan.');
      }
      entries.push({
        kode_akun: purchaseDiscount.kode_akun,
        tipe: 'DEBIT',
        jumlah: totals.totalDiskon,
      });
    }

    // Cr Beban / Persediaan
    for (const line of totals.calculatedLines) {
      const lineGross = Number(line.qty) * Number(line.hargaSatuan);
      const dims = Array.isArray(line.dimensions) ? line.dimensions : undefined;

      if (line.itemType === 'STOCK' && dto.returnStock) {
        if (!inventoryAccount) {
          throw new BadRequestException('Akun Persediaan (INVENTORY) belum dipetakan.');
        }
        entries.push({
          kode_akun: inventoryAccount.kode_akun,
          tipe: 'KREDIT',
          jumlah: lineGross,
          dimensions: dims,
        });
      } else {
        const expenseAcc = line.akunBiayaId
          ? (await this.prisma.chartOfAccount.findUnique({ where: { id: line.akunBiayaId } })) || defaultPurchaseExpense
          : defaultPurchaseExpense;

        entries.push({
          kode_akun: expenseAcc.kode_akun,
          tipe: 'KREDIT',
          jumlah: lineGross,
          dimensions: dims,
        });
      }
    }

    // Cr PPN Masukan
    if (totals.totalPpn > 0) {
      if (!ppnMasukan) {
        throw new BadRequestException('Akun PPN Masukan belum dipetakan.');
      }
      entries.push({
        kode_akun: ppnMasukan.kode_akun,
        tipe: 'KREDIT',
        jumlah: totals.totalPpn,
      });
    }

    // 9. Eksekusi Posting Jurnal GL
    const journal = await this.subledgerPostingService.postSubledgerJournal(
      tenantId,
      {
        tanggal: dto.tanggal,
        deskripsi: `Nota Debit ${noDokumen} - ${partner.nama}`,
        sumber_aplikasi: 'SUBLEDGER-AP',
        sourceDocType: 'DEBIT_NOTE',
        sourceDocId: noDokumen,
        no_voucher: noDokumen,
        mata_uang: mataUang,
        entries,
      },
    );

    // 10. Simpan Dokumen Nota Debit
    return await this.prisma.debitNote.create({
      data: {
        tenantId,
        noDokumen,
        billId: dto.billId || null,
        partnerId: dto.partnerId,
        tanggal: docDate,
        mata_uang: mataUang,
        kurs,
        returnStock: !!dto.returnStock,
        status: DebitNoteStatus.POSTED,
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
        journalId: journal.id,
        catatan: dto.catatan,
        externalRef: dto.externalRef,
        idempotencyKey: dto.idempotencyKey,
        createdBy: userName || 'SYSTEM',
        postedAt: new Date(),
        lines: {
          create: totals.calculatedLines.map((l) => ({
            itemId: l.itemId || null,
            itemType: l.itemType || 'SERVICE',
            deskripsi: l.deskripsi,
            qty: l.qty,
            hargaSatuan: l.hargaSatuan,
            diskon: l.diskon,
            ppnRate: l.ppnRate,
            jumlah: l.jumlah,
            akunBiayaId: l.akunBiayaId || null,
            dimensions: l.dimensions || null,
          })),
        },
      },
      include: {
        lines: true,
        partner: true,
        journal: true,
      },
    });
  }

  /**
   * Membatalkan Nota Debit (Void)
   */
  async voidDebitNote(tenantId: string, id: string, alasan: string) {
    const dn = await this.prisma.debitNote.findUnique({
      where: { id },
      include: { allocations: true },
    });

    if (!dn || dn.tenantId !== tenantId) {
      throw new NotFoundException('Nota debit tidak ditemukan');
    }

    if (dn.status !== DebitNoteStatus.POSTED) {
      throw new BadRequestException('Hanya nota debit berstatus POSTED yang dapat dibatalkan');
    }

    if (Number(dn.totalDialokasikan) > 0 || dn.allocations.length > 0) {
      throw new BadRequestException('Nota debit tidak dapat dibatalkan karena sudah teralokasi.');
    }

    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(),
    );

    let voidJournalId: string | null = null;
    if (dn.journalId) {
      const rev = await this.subledgerPostingService.reverseJournal(
        tenantId,
        dn.journalId,
        new Date().toISOString().slice(0, 10),
        `Pembatalan Nota Debit ${dn.noDokumen}: ${alasan}`,
      );
      voidJournalId = rev.id;
    }

    return await this.prisma.debitNote.update({
      where: { id },
      data: {
        status: DebitNoteStatus.VOID,
        voidJournalId,
      },
    });
  }

  /**
   * Mengambil daftar Nota Debit per tenant
   */
  async findAllDebitNotes(tenantId: string, partnerId?: string) {
    const where: any = { tenantId };
    if (partnerId) where.partnerId = partnerId;

    return await this.prisma.debitNote.findMany({
      where,
      include: {
        partner: true,
        lines: true,
        journal: true,
      },
      orderBy: { tanggal: 'desc' },
    });
  }
}
