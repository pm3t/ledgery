import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CashBankEntryDirection,
  CashBankSourceType,
  CashBankAccountType,
  CashFlowCategory,
} from '@prisma/client';

@Injectable()
export class CashBankReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. Laporan Buku Kas/Bank (Mutasi per rekening + Saldo Berjalan).
   */
  async getCashBookReport(
    tenantId: string,
    cashBankAccountId: string,
    filter?: { startDate?: string; endDate?: string; sourceType?: CashBankSourceType },
  ) {
    const account = await this.prisma.cashBankAccount.findFirst({
      where: { id: cashBankAccountId, tenantId },
      include: { chartOfAccount: true },
    });
    if (!account) throw new NotFoundException('Rekening kas/bank tidak ditemukan');

    const startDate = filter?.startDate ? new Date(`${filter.startDate}T00:00:00.000Z`) : undefined;
    const endDate = filter?.endDate ? new Date(`${filter.endDate}T23:59:59.999Z`) : undefined;

    // 1. Hitung Saldo Awal sebelum startDate
    let saldoAwal = 0;
    let saldoAwalFungsional = 0;

    if (startDate) {
      const priorEntries = await this.prisma.cashBankEntry.findMany({
        where: {
          cashBankAccountId,
          tanggal: { lt: startDate },
        },
        select: { arah: true, jumlah: true, jumlahFungsional: true },
      });

      for (const e of priorEntries) {
        const amt = Number(e.jumlah);
        const amtF = Number(e.jumlahFungsional);
        if (e.arah === CashBankEntryDirection.MASUK) {
          saldoAwal += amt;
          saldoAwalFungsional += amtF;
        } else {
          saldoAwal -= amt;
          saldoAwalFungsional -= amtF;
        }
      }
    }

    // 2. Ambil mutasi dalam periode
    const whereClause: any = {
      cashBankAccountId,
    };
    if (startDate && endDate) {
      whereClause.tanggal = { gte: startDate, lte: endDate };
    } else if (startDate) {
      whereClause.tanggal = { gte: startDate };
    } else if (endDate) {
      whereClause.tanggal = { lte: endDate };
    }
    if (filter?.sourceType) {
      whereClause.sourceType = filter.sourceType;
    }

    const entries = await this.prisma.cashBankEntry.findMany({
      where: whereClause,
      include: {
        journal: { select: { id: true, no_voucher: true, sumber_aplikasi: true } },
      },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    });

    let runningBalance = saldoAwal;
    let totalMasuk = 0;
    let totalKeluar = 0;

    const rows = entries.map((entry) => {
      const debit = entry.arah === CashBankEntryDirection.MASUK ? Number(entry.jumlah) : 0;
      const kredit = entry.arah === CashBankEntryDirection.KELUAR ? Number(entry.jumlah) : 0;
      runningBalance += debit - kredit;

      totalMasuk += debit;
      totalKeluar += kredit;

      return {
        id: entry.id,
        tanggal: entry.tanggal,
        sourceType: entry.sourceType,
        sourceDocId: entry.sourceDocId,
        keterangan: entry.keterangan,
        debit,
        kredit,
        saldoBerjalan: runningBalance,
        journalId: entry.journalId,
        noVoucher: entry.journal?.no_voucher || '-',
        clearedAt: entry.clearedAt,
        reconciliationId: entry.reconciliationId,
      };
    });

    return {
      account,
      periode: {
        startDate: filter?.startDate || null,
        endDate: filter?.endDate || null,
      },
      saldoAwal,
      totalMasuk,
      totalKeluar,
      saldoAkhir: runningBalance,
      rows,
    };
  }

  /**
   * 2. Laporan Posisi Kas & Bank (Saldo seluruh rekening per tanggal).
   */
  async getCashPositionReport(tenantId: string, asOfDate?: string) {
    const targetDate = asOfDate ? new Date(`${asOfDate}T23:59:59.999Z`) : new Date();

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const accounts = await this.prisma.cashBankAccount.findMany({
      where: { tenantId, isActive: true },
      include: { chartOfAccount: true },
      orderBy: [{ jenis: 'asc' }, { kode: 'asc' }],
    });

    const accountRows = [];
    let grandTotalFungsional = 0;

    for (const acc of accounts) {
      const entries = await this.prisma.cashBankEntry.findMany({
        where: {
          cashBankAccountId: acc.id,
          tanggal: { lte: targetDate },
        },
        select: { arah: true, jumlah: true, jumlahFungsional: true },
      });

      let saldo = 0;
      let saldoFungsional = 0;
      for (const e of entries) {
        const amt = Number(e.jumlah);
        const amtF = Number(e.jumlahFungsional);
        if (e.arah === CashBankEntryDirection.MASUK) {
          saldo += amt;
          saldoFungsional += amtF;
        } else {
          saldo -= amt;
          saldoFungsional -= amtF;
        }
      }

      grandTotalFungsional += saldoFungsional;

      accountRows.push({
        id: acc.id,
        kode: acc.kode,
        nama: acc.nama,
        jenis: acc.jenis,
        namaBank: acc.namaBank,
        noRekening: acc.noRekening,
        mataUang: acc.mata_uang,
        plafonKasKecil: acc.plafonKasKecil ? Number(acc.plafonKasKecil) : null,
        kodeAkunGL: acc.chartOfAccount.kode_akun,
        namaAkunGL: acc.chartOfAccount.nama_akun,
        saldo,
        saldoFungsional,
      });
    }

    return {
      asOfDate: asOfDate || new Date().toISOString().slice(0, 10),
      mataUangFungsional: tenant?.mata_uang || 'IDR',
      grandTotalFungsional,
      accounts: accountRows,
    };
  }

  /**
   * 3. Laporan Proyeksi Arus Kas (Cash Flow Projection).
   * Menghitung saldo kas awal ditambah piutang (AR) jatuh tempo dan dikurangi hutang (AP) jatuh tempo.
   */
  async getCashFlowProjectionReport(
    tenantId: string,
    options?: { horizonDays?: number; bucketMode?: 'WEEKLY' | 'MONTHLY' },
  ) {
    const horizonDays = options?.horizonDays || 60;
    const bucketMode = options?.bucketMode || 'WEEKLY';

    // 1. Ambil posisi kas saat ini
    const position = await this.getCashPositionReport(tenantId);
    let runningProjected = position.grandTotalFungsional;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + horizonDays);

    // 2. Ambil Piutang Penjualan (AR) berstatus POSTED yang belum lunas
    const openInvoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        saldo: { gt: 0 },
      },
      select: {
        id: true,
        noDokumen: true,
        jatuhTempo: true,
        saldo: true,
        partner: { select: { nama: true } },
      },
    });

    // 3. Ambil Tagihan Pembelian (AP) berstatus POSTED yang belum lunas
    const openBills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        saldo: { gt: 0 },
      },
      select: {
        id: true,
        noDokumen: true,
        jatuhTempo: true,
        saldo: true,
        partner: { select: { nama: true } },
      },
    });

    // 4. Bangun bucket waktu (mingguan / bulanan)
    const buckets: Array<{
      bucketIndex: number;
      label: string;
      startDate: string;
      endDate: string;
      inflowAR: number;
      outflowAP: number;
      netCashFlow: number;
      closingBalance: number;
      arItems: any[];
      apItems: any[];
    }> = [];

    const intervalDays = bucketMode === 'WEEKLY' ? 7 : 30;
    const totalBuckets = Math.ceil(horizonDays / intervalDays);

    let curStart = new Date(today);

    for (let i = 0; i < totalBuckets; i++) {
      const curEnd = new Date(curStart);
      curEnd.setDate(curEnd.getDate() + intervalDays - 1);
      curEnd.setHours(23, 59, 59, 999);

      // Cari faktur AR yang jatuh tempo dalam interval ini
      const arInThisBucket = openInvoices.filter((inv) => {
        const d = new Date(inv.jatuhTempo);
        return d >= curStart && d <= curEnd;
      });
      const inflow = arInThisBucket.reduce((sum, inv) => sum + Number(inv.saldo), 0);

      // Cari tagihan AP yang jatuh tempo dalam interval ini
      const apInThisBucket = openBills.filter((bill) => {
        const d = new Date(bill.jatuhTempo);
        return d >= curStart && d <= curEnd;
      });
      const outflow = apInThisBucket.reduce((sum, bill) => sum + Number(bill.saldo), 0);

      const net = inflow - outflow;
      runningProjected += net;

      const label =
        bucketMode === 'WEEKLY'
          ? `Minggu ${i + 1} (${curStart.toISOString().slice(5, 10)} - ${curEnd.toISOString().slice(5, 10)})`
          : `Bulan ${i + 1} (${curStart.toISOString().slice(0, 7)})`;

      buckets.push({
        bucketIndex: i + 1,
        label,
        startDate: curStart.toISOString().slice(0, 10),
        endDate: curEnd.toISOString().slice(0, 10),
        inflowAR: inflow,
        outflowAP: outflow,
        netCashFlow: net,
        closingBalance: runningProjected,
        arItems: arInThisBucket,
        apItems: apInThisBucket,
      });

      curStart = new Date(curStart);
      curStart.setDate(curStart.getDate() + intervalDays);
    }

    return {
      currentCashBalance: position.grandTotalFungsional,
      horizonDays,
      bucketMode,
      totalProjectedInflow: buckets.reduce((s, b) => s + b.inflowAR, 0),
      totalProjectedOutflow: buckets.reduce((s, b) => s + b.outflowAP, 0),
      endingProjectedCash: runningProjected,
      buckets,
    };
  }

  /**
   * 4. Laporan Arus Kas Metode Langsung (Direct Cash Flow Method).
   * Mengagregasi CashBankEntry berdasarkan kategori arus kas (OPERASI, INVESTASI, PENDANAAN)
   * dari AKUN LAWAN pada jurnal transaksi yang sama.
   * Transfer antar rekening sendiri DIKECUALIKAN.
   */
  async getDirectCashFlowReport(
    tenantId: string,
    filter?: { startDate?: string; endDate?: string },
  ) {
    const startDate = filter?.startDate ? new Date(`${filter.startDate}T00:00:00.000Z`) : undefined;
    const endDate = filter?.endDate ? new Date(`${filter.endDate}T23:59:59.999Z`) : undefined;

    // 1. Hitung saldo awal kas & bank gabungan sebelum startDate
    let saldoAwalKas = 0;
    if (startDate) {
      const priorEntries = await this.prisma.cashBankEntry.findMany({
        where: {
          tenantId,
          tanggal: { lt: startDate },
        },
        select: { arah: true, jumlahFungsional: true },
      });
      for (const e of priorEntries) {
        const amt = Number(e.jumlahFungsional);
        saldoAwalKas += e.arah === CashBankEntryDirection.MASUK ? amt : -amt;
      }
    }

    // 2. Ambil entri kas dalam periode (KECUALIKAN CASH_TRANSFER internal)
    const whereClause: any = {
      tenantId,
      sourceType: { not: CashBankSourceType.CASH_TRANSFER },
    };
    if (startDate && endDate) {
      whereClause.tanggal = { gte: startDate, lte: endDate };
    } else if (startDate) {
      whereClause.tanggal = { gte: startDate };
    } else if (endDate) {
      whereClause.tanggal = { lte: endDate };
    }

    const entries = await this.prisma.cashBankEntry.findMany({
      where: whereClause,
      include: {
        journal: {
          include: {
            entries: {
              include: { chartOfAccount: true },
            },
          },
        },
      },
    });

    const categories: Record<
      'OPERASI' | 'INVESTASI' | 'PENDANAAN' | 'BELUM_DIKATEGORIKAN',
      {
        masuk: number;
        keluar: number;
        items: Map<string, { namaAkun: string; kodeAkun: string; nominal: number }>;
      }
    > = {
      OPERASI: { masuk: 0, keluar: 0, items: new Map() },
      INVESTASI: { masuk: 0, keluar: 0, items: new Map() },
      PENDANAAN: { masuk: 0, keluar: 0, items: new Map() },
      BELUM_DIKATEGORIKAN: { masuk: 0, keluar: 0, items: new Map() },
    };

    for (const e of entries) {
      // Jika entry berasal dari saldo awal OPENING tanpa jurnal, masukkan ke belum dikategorikan atau saldo awal
      if (!e.journal || !e.journal.entries || e.journal.entries.length === 0) {
        continue;
      }

      // Temukan akun lawan pada jurnal yang sama (akun yang BUKAN akun kas/bank pada baris ini)
      const contraEntries = e.journal.entries.filter(
        (je) => je.id !== e.journalEntryId && je.chartOfAccount.controlType !== 'CASH_BANK',
      );

      const totalContraAmount = contraEntries.reduce((sum, ce) => sum + Number(ce.jumlah), 0);
      const isMasuk = e.arah === CashBankEntryDirection.MASUK;
      const nominalFungsional = Number(e.jumlahFungsional);

      if (contraEntries.length === 0) {
        // Fallback jika tidak ada contra entry non-cash
        const catKey = 'BELUM_DIKATEGORIKAN';
        if (isMasuk) categories[catKey].masuk += nominalFungsional;
        else categories[catKey].keluar += nominalFungsional;
        continue;
      }

      // Alokasikan secara proporsional ke akun-akun lawan
      for (const ce of contraEntries) {
        const prop = totalContraAmount > 0 ? Number(ce.jumlah) / totalContraAmount : 1 / contraEntries.length;
        const allocatedAmount = nominalFungsional * prop;
        const categoryKey: 'OPERASI' | 'INVESTASI' | 'PENDANAAN' | 'BELUM_DIKATEGORIKAN' =
          ce.chartOfAccount.cashFlowCategory || 'BELUM_DIKATEGORIKAN';

        if (isMasuk) {
          categories[categoryKey].masuk += allocatedAmount;
        } else {
          categories[categoryKey].keluar += allocatedAmount;
        }

        const itemKey = `${ce.chartOfAccount.kode_akun} - ${ce.chartOfAccount.nama_akun}`;
        const existing = categories[categoryKey].items.get(itemKey) || {
          kodeAkun: ce.chartOfAccount.kode_akun,
          namaAkun: ce.chartOfAccount.nama_akun,
          nominal: 0,
        };
        existing.nominal += isMasuk ? allocatedAmount : -allocatedAmount;
        categories[categoryKey].items.set(itemKey, existing);
      }
    }

    // Format output
    const formatCategory = (catKey: 'OPERASI' | 'INVESTASI' | 'PENDANAAN' | 'BELUM_DIKATEGORIKAN') => {
      const c = categories[catKey];
      return {
        arusKasMasuk: c.masuk,
        arusKasKeluar: c.keluar,
        arusKasBersih: c.masuk - c.keluar,
        rincian: Array.from(c.items.values()),
      };
    };

    const operasi = formatCategory('OPERASI');
    const investasi = formatCategory('INVESTASI');
    const pendanaan = formatCategory('PENDANAAN');
    const belumDikategorikan = formatCategory('BELUM_DIKATEGORIKAN');

    const totalPerubahanKas =
      operasi.arusKasBersih +
      investasi.arusKasBersih +
      pendanaan.arusKasBersih +
      belumDikategorikan.arusKasBersih;

    const saldoAkhirKas = saldoAwalKas + totalPerubahanKas;

    return {
      periode: {
        startDate: filter?.startDate || null,
        endDate: filter?.endDate || null,
      },
      operasi,
      investasi,
      pendanaan,
      belumDikategorikan,
      kenaikanPenurunanBersihKas: totalPerubahanKas,
      saldoAwalKas,
      saldoAkhirKas,
    };
  }
}
