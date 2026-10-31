import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseBillStatus, VendorPaymentStatus, DebitNoteStatus } from '@prisma/client';

export interface ApAgingBucketSummary {
  partnerId: string;
  partnerKode: string;
  partnerNama: string;
  totalHutang: number;
  current: number; // Belum jatuh tempo
  bucket1: number; // Misal 1-30 hari
  bucket2: number; // Misal 31-60 hari
  bucket3: number; // Misal 61-90 hari
  older: number;   // Misal >90 hari
  bills: any[];
}

export interface PaymentScheduleItem {
  id: string;
  noDokumen: string;
  noFakturVendor?: string | null;
  partnerId: string;
  partnerKode: string;
  partnerNama: string;
  tanggal: Date;
  jatuhTempo: Date;
  daysUntilDue: number; // Negatif = sudah lewat jatuh tempo
  urgency: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING';
  mata_uang: string;
  kurs: number;
  total: number;
  saldo: number;
  saldoFungsional: number;
}

@Injectable()
export class ApReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Laporan Umur Hutang (Aging Report) berdasarkan bucket SubledgerSetting
   */
  async getAgingReport(tenantId: string, asOfDateStr?: string) {
    const asOf = asOfDateStr ? new Date(asOfDateStr) : new Date();

    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    const buckets: number[] = (setting?.agingBuckets as number[]) || [30, 60, 90];
    const [b1, b2, b3] = buckets.length >= 3 ? buckets : [30, 60, 90];

    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: { in: [PurchaseBillStatus.POSTED, PurchaseBillStatus.PARTIAL] },
        saldo: { gt: 0 },
        tanggal: { lte: asOf },
      },
      include: {
        partner: true,
      },
      orderBy: { jatuhTempo: 'asc' },
    });

    const partnerMap = new Map<string, ApAgingBucketSummary>();

    for (const bill of bills) {
      const p = bill.partner;
      if (!partnerMap.has(p.id)) {
        partnerMap.set(p.id, {
          partnerId: p.id,
          partnerKode: p.kode,
          partnerNama: p.nama,
          totalHutang: 0,
          current: 0,
          bucket1: 0,
          bucket2: 0,
          bucket3: 0,
          older: 0,
          bills: [],
        });
      }

      const summary = partnerMap.get(p.id)!;
      const saldo = Number(bill.saldo);
      const saldoFungsional = Number(bill.saldoFungsional);

      // Hitung hari keterlambatan terhadap tanggal jatuh tempo
      const diffMs = asOf.getTime() - bill.jatuhTempo.getTime();
      const overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      summary.totalHutang += saldoFungsional;

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

      summary.bills.push({
        id: bill.id,
        noDokumen: bill.noDokumen,
        noFakturVendor: bill.noFakturVendor,
        tanggal: bill.tanggal,
        jatuhTempo: bill.jatuhTempo,
        overdueDays,
        bucketCategory,
        mata_uang: bill.mata_uang,
        kurs: Number(bill.kurs),
        total: Number(bill.total),
        saldo,
        saldoFungsional,
      });
    }

    const items = Array.from(partnerMap.values());
    const grandTotal = items.reduce((sum, item) => sum + item.totalHutang, 0);
    const totalCurrent = items.reduce((sum, item) => sum + item.current, 0);
    const totalBucket1 = items.reduce((sum, item) => sum + item.bucket1, 0);
    const totalBucket2 = items.reduce((sum, item) => sum + item.bucket2, 0);
    const totalBucket3 = items.reduce((sum, item) => sum + item.bucket3, 0);
    const totalOlder = items.reduce((sum, item) => sum + item.older, 0);

    return {
      asOfDate: asOf.toISOString().slice(0, 10),
      buckets: [b1, b2, b3],
      bucketLabels: {
        current: 'Belum Jatuh Tempo',
        bucket1: `1 - ${b1} Hari`,
        bucket2: `${b1 + 1} - ${b2} Hari`,
        bucket3: `${b2 + 1} - ${b3} Hari`,
        older: `> ${b3} Hari`,
      },
      grandTotal,
      totalCurrent,
      totalBucket1,
      totalBucket2,
      totalBucket3,
      totalOlder,
      items,
    };
  }

  /**
   * Kartu Hutang Vendor (Vendor Statement / Ledger Mutasi Saldo Berjalan)
   */
  async getVendorLedger(
    tenantId: string,
    partnerId: string,
    startDateStr?: string,
    endDateStr?: string,
  ) {
    const partner = await this.prisma.businessPartner.findUnique({
      where: { id: partnerId },
    });

    if (!partner || partner.tenantId !== tenantId) {
      throw new NotFoundException('Vendor tidak ditemukan');
    }

    const startDate = startDateStr ? new Date(startDateStr) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = endDateStr ? new Date(endDateStr) : new Date();

    // 1. Hitung Saldo Awal sebelum startDate
    const priorBills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        partnerId,
        status: { in: [PurchaseBillStatus.POSTED, PurchaseBillStatus.PARTIAL, PurchaseBillStatus.PAID] },
        tanggal: { lt: startDate },
      },
    });

    const priorPayments = await this.prisma.vendorPayment.findMany({
      where: {
        tenantId,
        partnerId,
        status: VendorPaymentStatus.POSTED,
        tanggal: { lt: startDate },
      },
    });

    const priorDebitNotes = await this.prisma.debitNote.findMany({
      where: {
        tenantId,
        partnerId,
        status: DebitNoteStatus.POSTED,
        tanggal: { lt: startDate },
      },
    });

    let openingBalance = 0;
    for (const b of priorBills) openingBalance += Number(b.totalFungsional);
    for (const p of priorPayments) openingBalance -= Number(p.jumlahFungsional);
    for (const d of priorDebitNotes) openingBalance -= Number(d.totalFungsional);

    // 2. Ambil Transaksi Dalam Rentang Periode
    const currentBills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        partnerId,
        status: { in: [PurchaseBillStatus.POSTED, PurchaseBillStatus.PARTIAL, PurchaseBillStatus.PAID] },
        tanggal: { gte: startDate, lte: endDate },
      },
    });

    const currentPayments = await this.prisma.vendorPayment.findMany({
      where: {
        tenantId,
        partnerId,
        status: VendorPaymentStatus.POSTED,
        tanggal: { gte: startDate, lte: endDate },
      },
    });

    const currentDebitNotes = await this.prisma.debitNote.findMany({
      where: {
        tenantId,
        partnerId,
        status: DebitNoteStatus.POSTED,
        tanggal: { gte: startDate, lte: endDate },
      },
    });

    const mutations: any[] = [];

    // Faktur Pembelian: Menambah Hutang (Kredit)
    for (const b of currentBills) {
      mutations.push({
        tanggal: b.tanggal,
        tipeTransaksi: 'PURCHASE_BILL',
        noDokumen: b.noDokumen,
        keterangan: `Faktur Pembelian: ${b.noDokumen}${b.noFakturVendor ? ` (Faktur Vendor: ${b.noFakturVendor})` : ''}`,
        debit: 0,
        kredit: Number(b.totalFungsional),
        mata_uang: b.mata_uang,
        kurs: Number(b.kurs),
        jumlahDokumen: Number(b.total),
      });
    }

    // Pembayaran Vendor: Mengurangi Hutang (Debit)
    for (const p of currentPayments) {
      mutations.push({
        tanggal: p.tanggal,
        tipeTransaksi: 'VENDOR_PAYMENT',
        noDokumen: p.noDokumen,
        keterangan: `Pembayaran Vendor: ${p.noDokumen}`,
        debit: Number(p.jumlahFungsional),
        kredit: 0,
        mata_uang: p.mata_uang,
        kurs: Number(p.kurs),
        jumlahDokumen: Number(p.jumlah),
      });
    }

    // Nota Debit: Mengurangi Hutang (Debit)
    for (const d of currentDebitNotes) {
      mutations.push({
        tanggal: d.tanggal,
        tipeTransaksi: 'DEBIT_NOTE',
        noDokumen: d.noDokumen,
        keterangan: `Nota Debit: ${d.noDokumen}`,
        debit: Number(d.totalFungsional),
        kredit: 0,
        mata_uang: d.mata_uang,
        kurs: Number(d.kurs),
        jumlahDokumen: Number(d.total),
      });
    }

    // Urutkan transaksi secara kronologis
    mutations.sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

    // Hitung Saldo Berjalan (Hutang = saldo normal KREDIT)
    let runningBalance = openingBalance;
    const transactions = mutations.map((m) => {
      runningBalance = runningBalance + m.kredit - m.debit;
      return {
        ...m,
        saldoBerjalan: runningBalance,
      };
    });

    return {
      vendor: {
        id: partner.id,
        kode: partner.kode,
        nama: partner.nama,
        alamat: partner.alamat,
        npwp: partner.npwp,
        kontak: partner.kontak,
        termPembayaranHari: partner.termPembayaranHari,
      },
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      openingBalance,
      closingBalance: runningBalance,
      transactions,
    };
  }

  /**
   * Jadwal Pembayaran (Payment Schedule / Cash Outflow Planning)
   * Menyajikan tagihan-tagihan pembelian yang jatuh tempo dalam N hari ke depan,
   * dengan status urgensi dan total komitmen kas.
   */
  async getPaymentSchedule(
    tenantId: string,
    daysAhead: number = 30,
    partnerId?: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cutOff = new Date(today);
    cutOff.setDate(cutOff.getDate() + daysAhead);
    cutOff.setHours(23, 59, 59, 999);

    const where: any = {
      tenantId,
      status: { in: [PurchaseBillStatus.POSTED, PurchaseBillStatus.PARTIAL] },
      saldo: { gt: 0 },
      jatuhTempo: { lte: cutOff },
    };

    if (partnerId) {
      where.partnerId = partnerId;
    }

    const bills = await this.prisma.purchaseBill.findMany({
      where,
      include: {
        partner: true,
      },
      orderBy: { jatuhTempo: 'asc' },
    });

    let totalKomitmenFungsional = 0;
    let totalLewatJatuhTempo = 0;
    let totalHariIni = 0;
    let totalMingguIni = 0; // 1 - 7 hari
    let totalBulanIni = 0;  // 8 - 30 hari

    const items: PaymentScheduleItem[] = bills.map((bill) => {
      const jatuhTempo = new Date(bill.jatuhTempo);
      jatuhTempo.setHours(0, 0, 0, 0);

      const diffTime = jatuhTempo.getTime() - today.getTime();
      const daysUntilDue = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let urgency: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING' = 'UPCOMING';
      const saldoFungsional = Number(bill.saldoFungsional);
      totalKomitmenFungsional += saldoFungsional;

      if (daysUntilDue < 0) {
        urgency = 'OVERDUE';
        totalLewatJatuhTempo += saldoFungsional;
      } else if (daysUntilDue === 0) {
        urgency = 'DUE_TODAY';
        totalHariIni += saldoFungsional;
      } else if (daysUntilDue <= 7) {
        urgency = 'DUE_SOON';
        totalMingguIni += saldoFungsional;
      } else {
        urgency = 'UPCOMING';
        totalBulanIni += saldoFungsional;
      }

      return {
        id: bill.id,
        noDokumen: bill.noDokumen,
        noFakturVendor: bill.noFakturVendor,
        partnerId: bill.partnerId,
        partnerKode: bill.partner.kode,
        partnerNama: bill.partner.nama,
        tanggal: bill.tanggal,
        jatuhTempo: bill.jatuhTempo,
        daysUntilDue,
        urgency,
        mata_uang: bill.mata_uang,
        kurs: Number(bill.kurs),
        total: Number(bill.total),
        saldo: Number(bill.saldo),
        saldoFungsional,
      };
    });

    return {
      asOfDate: today.toISOString().slice(0, 10),
      daysAhead,
      cutOffDate: cutOff.toISOString().slice(0, 10),
      totalBills: items.length,
      totalKomitmenFungsional,
      summary: {
        overdue: totalLewatJatuhTempo,
        dueToday: totalHariIni,
        dueThisWeek: totalMingguIni,
        dueLater: totalBulanIni,
      },
      items,
    };
  }
}

