import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { DefaultInventoryIssueService } from './inventory-issue.service';
import { CreateCreditNoteDto } from './dto/credit-note.dto';
import { CreditNoteStatus, PostingSetupKey } from '@prisma/client';

@Injectable()
export class CreditNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly accountingPeriodService: AccountingPeriodService,
    private readonly inventoryIssueService: DefaultInventoryIssueService,
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
   * Membuat dan memposting Nota Kredit
   */
  async createAndPostCreditNote(
    tenantId: string,
    dto: CreateCreditNoteDto,
    userName?: string,
  ) {
    // 1. Dukungan Idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.creditNote.findUnique({
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

    // 3. Validasi Partner
    const partner = await this.prisma.businessPartner.findUnique({
      where: { id: dto.partnerId },
    });
    if (!partner || partner.tenantId !== tenantId) {
      throw new NotFoundException('Pelanggan tidak ditemukan');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const mataUang = dto.mata_uang || tenant?.mata_uang || 'IDR';
    const kurs = dto.kurs || 1;

    const totals = this.calculateTotals(dto.lines, kurs);

    // 4. Ambil Akun dari PostingSetup
    const groupCode = partner.groupCode || undefined;
    const arControl = await this.getPostingAccount(tenantId, 'AR_CONTROL', groupCode);
    const defaultSalesRevenue = await this.getPostingAccount(tenantId, 'SALES_REVENUE', groupCode);
    const salesDiscount = await this.getPostingAccount(tenantId, 'SALES_DISCOUNT', groupCode);
    const ppnKeluaran = await this.getPostingAccount(tenantId, 'PPN_KELUARAN', groupCode);
    const cogsAccount = await this.getPostingAccount(tenantId, 'COGS', groupCode);
    const inventoryAccount = await this.getPostingAccount(tenantId, 'INVENTORY', groupCode);

    if (!arControl) {
      throw new BadRequestException('Akun kontrol Piutang (AR_CONTROL) belum dipetakan.');
    }
    if (!defaultSalesRevenue) {
      throw new BadRequestException('Akun Pendapatan Penjualan (SALES_REVENUE) belum dipetakan.');
    }

    // 5. Tangani Return Stock
    let totalCogsReturn = 0;
    if (dto.returnStock) {
      for (const line of dto.lines) {
        if (line.itemType === 'STOCK' && line.itemId) {
          const res = await this.inventoryIssueService.returnStockForCreditNote(
            tenantId,
            {
              creditNoteId: 'PENDING',
              itemId: line.itemId,
              qty: Number(line.qty),
              tanggal: new Date(dto.tanggal),
            },
          );
          totalCogsReturn += res.cogsAmount;
        }
      }
    }

    // 6. Generate No Dokumen
    const noDokumen = await this.documentNumberingService.generateNextNumber(
      tenantId,
      'AR_CREDIT_NOTE',
      'CN',
    );

    // 7. Susun Jurnal Nota Kredit (Kebalikan Faktur)
    const entries: any[] = [];

    // Cr Piutang = Total Nota Kredit
    entries.push({
      kode_akun: arControl.kode_akun,
      tipe: 'KREDIT',
      jumlah: totals.total,
    });

    // Dr Pendapatan Penjualan per baris
    for (const line of totals.calculatedLines) {
      entries.push({
        kode_akun: defaultSalesRevenue.kode_akun,
        tipe: 'DEBIT',
        jumlah: line.qty * line.hargaSatuan,
        dimensions: line.dimensions,
      });
    }

    // Dr PPN Keluaran
    if (totals.totalPpn > 0 && ppnKeluaran) {
      entries.push({
        kode_akun: ppnKeluaran.kode_akun,
        tipe: 'DEBIT',
        jumlah: totals.totalPpn,
      });
    }

    // Cr Potongan Penjualan
    if (totals.totalDiskon > 0 && salesDiscount) {
      entries.push({
        kode_akun: salesDiscount.kode_akun,
        tipe: 'KREDIT',
        jumlah: totals.totalDiskon,
      });
    }

    // Dr Persediaan / Cr HPP (jika ada pengembalian stok)
    if (totalCogsReturn > 0 && inventoryAccount && cogsAccount) {
      entries.push({
        kode_akun: inventoryAccount.kode_akun,
        tipe: 'DEBIT',
        jumlah: totalCogsReturn,
      });
      entries.push({
        kode_akun: cogsAccount.kode_akun,
        tipe: 'KREDIT',
        jumlah: totalCogsReturn,
      });
    }

    // 8. Posting Jurnal GL
    const journal = await this.subledgerPostingService.postSubledgerJournal(
      tenantId,
      {
        tanggal: dto.tanggal,
        deskripsi: `Nota Kredit ${noDokumen} - ${partner.nama}`,
        sumber_aplikasi: 'SUBLEDGER-AR',
        sourceDocType: 'CREDIT_NOTE',
        no_voucher: noDokumen,
        mata_uang: mataUang,
        entries,
      },
    );

    // 9. Simpan Record Nota Kredit
    return await this.prisma.creditNote.create({
      data: {
        tenantId,
        noDokumen,
        tanggal: new Date(dto.tanggal),
        partnerId: dto.partnerId,
        invoiceId: dto.invoiceId || null,
        returnStock: !!dto.returnStock,
        mata_uang: mataUang,
        kurs,
        status: CreditNoteStatus.POSTED,
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
        journalId: journal.id,
        catatan: dto.catatan,
        externalRef: dto.externalRef,
        idempotencyKey: dto.idempotencyKey,
        createdBy: userName || 'SYSTEM',
        postedAt: new Date(),
        postedBy: userName || 'SYSTEM',
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
            akunPendapatanId: l.akunPendapatanId || null,
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
   * Membatalkan / Void Nota Kredit
   */
  async voidCreditNote(tenantId: string, id: string, alasan?: string, user?: any) {
    const note = await this.prisma.creditNote.findUnique({
      where: { id },
      include: { allocations: true },
    });

    if (!note || note.tenantId !== tenantId) {
      throw new NotFoundException('Nota kredit tidak ditemukan');
    }

    if (note.status === CreditNoteStatus.VOID) {
      throw new BadRequestException('Nota kredit ini sudah berstatus VOID');
    }

    if (note.allocations.length > 0 || Number(note.totalDialokasikan) > 0) {
      throw new BadRequestException(
        'Nota kredit tidak dapat di-void karena sudah dialokasikan ke faktur.',
      );
    }

    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(),
    );

    let voidJournalId: string | null = null;
    if (note.journalId) {
      const reversalJournal = await this.subledgerPostingService.reverseJournal(
        tenantId,
        note.journalId,
        new Date().toISOString().slice(0, 10),
        alasan || `Void Nota Kredit ${note.noDokumen}`,
      );
      voidJournalId = reversalJournal.id;
    }

    return await this.prisma.creditNote.update({
      where: { id },
      data: {
        status: CreditNoteStatus.VOID,
        voidJournalId,
        voidedAt: new Date(),
        voidedBy: user?.userId || user?.id || user?.email || 'SYSTEM',
        saldo: 0,
        saldoFungsional: 0,
      },
    });
  }

  /**
   * Menampilkan semua nota kredit
   */
  async findAll(tenantId: string, partnerId?: string) {
    const where: any = { tenantId };
    if (partnerId) where.partnerId = partnerId;

    return await this.prisma.creditNote.findMany({
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
