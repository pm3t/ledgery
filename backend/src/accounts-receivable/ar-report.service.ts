import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesInvoiceStatus, CustomerReceiptStatus, CreditNoteStatus } from '@prisma/client';

export interface AgingBucketSummary {
  partnerId: string;
  partnerKode: string;
  partnerNama: string;
  totalPiutang: number;
  current: number; // Belum jatuh tempo
  bucket1: number; // Misal 1-30 hari
  bucket2: number; // Misal 31-60 hari
  bucket3: number; // Misal 61-90 hari
  older: number;   // Misal >90 hari
  invoices: any[];
}

@Injectable()
export class ArReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Laporan Umur Piutang (Aging Report) berdasarkan bucket SubledgerSetting
   */
  async getAgingReport(tenantId: string, asOfDateStr?: string) {
    const asOf = asOfDateStr ? new Date(asOfDateStr) : new Date();

    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    const buckets: number[] = (setting?.agingBuckets as number[]) || [30, 60, 90];
    const [b1, b2, b3] = buckets.length >= 3 ? buckets : [30, 60, 90];

    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId,
        status: { in: [SalesInvoiceStatus.POSTED, SalesInvoiceStatus.PARTIAL] },
        saldo: { gt: 0 },
        tanggal: { lte: asOf },
      },
      include: {
        partner: true,
      },
      orderBy: { jatuhTempo: 'asc' },
    });

    const partnerMap = new Map<string, AgingBucketSummary>();

    for (const inv of invoices) {
      const p = inv.partner;
      if (!partnerMap.has(p.id)) {
        partnerMap.set(p.id, {
          partnerId: p.id,
          partnerKode: p.kode,
          partnerNama: p.nama,
          totalPiutang: 0,
          current: 0,
          bucket1: 0,
          bucket2: 0,
          bucket3: 0,
          older: 0,
          invoices: [],
        });
      }

      const summary = partnerMap.get(p.id)!;
      const saldo = Number(inv.saldo);
      const saldoFungsional = Number(inv.saldoFungsional);

      // Hitung hari keterlambatan terhadap tanggal jatuh tempo
      const diffMs = asOf.getTime() - inv.jatuhTempo.getTime();
      const overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      summary.totalPiutang += saldoFungsional;

      let bucketCategory = 'current';
      if (overdueDays <= 0) {
        summary.current += saldoFungsional;
      } else if (overdueDays <= b1) {
        summary.bucket1 += saldoFungsional;
        bucketCategory = `1-${b1}`;
      } else if (overdueDays <= b2) {
        summary.bucket2 += saldoFungsional;
        bucketCategory = `${b1 + 1}-${b2}`;
      } else if (overdueDays <= b3) {
        summary.bucket3 += saldoFungsional;
        bucketCategory = `${b2 + 1}-${b3}`;
      } else {
        summary.older += saldoFungsional;
        bucketCategory = `>${b3}`;
      }

      summary.invoices.push({
        id: inv.id,
        noDokumen: inv.noDokumen,
        tanggal: inv.tanggal,
        jatuhTempo: inv.jatuhTempo,
        overdueDays,
        bucketCategory,
        mataUang: inv.mata_uang,
        kurs: Number(inv.kurs),
        saldo,
        saldoFungsional,
        total: Number(inv.total),
        externalRef: inv.externalRef,
      });
    }

    const customerSummaries = Array.from(partnerMap.values());

    const grandTotal = customerSummaries.reduce(
      (acc, curr) => ({
        totalPiutang: acc.totalPiutang + curr.totalPiutang,
        current: acc.current + curr.current,
        bucket1: acc.bucket1 + curr.bucket1,
        bucket2: acc.bucket2 + curr.bucket2,
        bucket3: acc.bucket3 + curr.bucket3,
        older: acc.older + curr.older,
      }),
      { totalPiutang: 0, current: 0, bucket1: 0, bucket2: 0, bucket3: 0, older: 0 },
    );

    return {
      asOfDate: asOf.toISOString().slice(0, 10),
      bucketDefinitions: {
        current: 'Belum Jatuh Tempo',
        bucket1: `1 - ${b1} Hari`,
        bucket2: `${b1 + 1} - ${b2} Hari`,
        bucket3: `${b2 + 1} - ${b3} Hari`,
        older: `> ${b3} Hari`,
      },
      grandTotal,
      customers: customerSummaries,
    };
  }

  /**
   * Kartu Piutang / Rekening Koran Pelanggan (Customer Ledger)
   */
  async getCustomerLedger(
    tenantId: string,
    partnerId: string,
    startDateStr?: string,
    endDateStr?: string,
  ) {
    const partner = await this.prisma.businessPartner.findUnique({
      where: { id: partnerId },
    });

    if (!partner || partner.tenantId !== tenantId) {
      throw new NotFoundException('Pelanggan tidak ditemukan');
    }

    const startDate = startDateStr ? new Date(startDateStr) : new Date('2020-01-01');
    const endDate = endDateStr ? new Date(endDateStr) : new Date();

    // 1. Hitung Saldo Awal sebelum startDate
    const priorInvoices = await this.prisma.salesInvoice.aggregate({
      where: {
        tenantId,
        partnerId,
        status: { in: [SalesInvoiceStatus.POSTED, SalesInvoiceStatus.PARTIAL, SalesInvoiceStatus.PAID] },
        tanggal: { lt: startDate },
      },
      _sum: { totalFungsional: true },
    });

    const priorReceipts = await this.prisma.customerReceipt.aggregate({
      where: {
        tenantId,
        partnerId,
        status: CustomerReceiptStatus.POSTED,
        tanggal: { lt: startDate },
      },
      _sum: { jumlahFungsional: true },
    });

    const priorCreditNotes = await this.prisma.creditNote.aggregate({
      where: {
        tenantId,
        partnerId,
        status: CreditNoteStatus.POSTED,
        tanggal: { lt: startDate },
      },
      _sum: { totalFungsional: true },
    });

    const initialDebits = Number(priorInvoices._sum.totalFungsional || 0);
    const initialCredits =
      Number(priorReceipts._sum.jumlahFungsional || 0) +
      Number(priorCreditNotes._sum.totalFungsional || 0);

    const saldoAwal = initialDebits - initialCredits;

    // 2. Ambil Transaksi Dalam Rentang Tanggal
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId,
        partnerId,
        status: { in: [SalesInvoiceStatus.POSTED, SalesInvoiceStatus.PARTIAL, SalesInvoiceStatus.PAID] },
        tanggal: { gte: startDate, lte: endDate },
      },
    });

    const receipts = await this.prisma.customerReceipt.findMany({
      where: {
        tenantId,
        partnerId,
        status: CustomerReceiptStatus.POSTED,
        tanggal: { gte: startDate, lte: endDate },
      },
    });

    const creditNotes = await this.prisma.creditNote.findMany({
      where: {
        tenantId,
        partnerId,
        status: CreditNoteStatus.POSTED,
        tanggal: { gte: startDate, lte: endDate },
      },
    });

    // 3. Gabungkan seluruh mutasi dan urutkan kronologis
    const transactions: any[] = [];

    invoices.forEach((inv) => {
      transactions.push({
        tanggal: inv.tanggal,
        tipe: 'FAKTUR',
        noDokumen: inv.noDokumen,
        deskripsi: `Faktur Penjualan ${inv.noDokumen}`,
        mataUang: inv.mata_uang,
        kurs: Number(inv.kurs),
        debit: Number(inv.totalFungsional),
        kredit: 0,
      });
    });

    receipts.forEach((rct) => {
      transactions.push({
        tanggal: rct.tanggal,
        tipe: 'PENERIMAAN',
        noDokumen: rct.noDokumen,
        deskripsi: `Penerimaan Kas/Bank ${rct.noDokumen}`,
        mataUang: rct.mata_uang,
        kurs: Number(rct.kurs),
        debit: 0,
        kredit: Number(rct.jumlahFungsional),
      });
    });

    creditNotes.forEach((cn) => {
      transactions.push({
        tanggal: cn.tanggal,
        tipe: 'NOTA_KREDIT',
        noDokumen: cn.noDokumen,
        deskripsi: `Nota Kredit Retur/Diskon ${cn.noDokumen}`,
        mataUang: cn.mata_uang,
        kurs: Number(cn.kurs),
        debit: 0,
        kredit: Number(cn.totalFungsional),
      });
    });

    transactions.sort((a, b) => a.tanggal.getTime() - b.tanggal.getTime());

    // 4. Hitung Saldo Berjalan (Running Balance)
    let runningBalance = saldoAwal;
    const lines = transactions.map((t) => {
      runningBalance = runningBalance + t.debit - t.kredit;
      return {
        ...t,
        saldoBerjalan: runningBalance,
      };
    });

    return {
      partner: {
        id: partner.id,
        kode: partner.kode,
        nama: partner.nama,
        npwp: partner.npwp,
        alamat: partner.alamat,
        kontak: partner.kontak,
        creditLimit: partner.creditLimit,
        termPembayaranHari: partner.termPembayaranHari,
      },
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      saldoAwal,
      mutasi: lines,
      saldoAkhir: runningBalance,
    };
  }
}

