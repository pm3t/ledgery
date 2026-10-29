import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KategoriAkun } from '@prisma/client';

@Injectable()
export class FinancialReportService {
  constructor(private readonly prisma: PrismaService) {}

  // Helper: Ambil saldo semua akun pada periode tertentu
  private async getAccountBalances(tenantId: string, startDate?: string, endDate?: string, dimensionValues?: string) {
    const coas = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, isActive: true },
      orderBy: { kode_akun: 'asc' },
    });

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const whereClause: any = {
      journal: {
        tenantId,
        status: { in: ['POSTED', 'APPROVED'] },
        tanggal: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
      },
    };

    if (dimensionValues) {
      const dimIds = dimensionValues.split(',').map(id => id.trim()).filter(Boolean);
      if (dimIds.length > 0) {
        whereClause.AND = dimIds.map(id => ({
          dimensions: {
            some: { dimensionValueId: id }
          }
        }));
      }
    }

    const entries = await this.prisma.journalEntry.findMany({
      where: whereClause,
    });

    // Agregasi per akun
    const balances = new Map<string, { debit: number; kredit: number; saldo: number }>();

    coas.forEach(coa => {
      balances.set(coa.id, { debit: 0, kredit: 0, saldo: 0 });
    });

    entries.forEach(entry => {
      const current = balances.get(entry.chartOfAccountId);
      if (current) {
        if (entry.tipe === 'DEBIT') current.debit += Number(entry.jumlah);
        if (entry.tipe === 'KREDIT') current.kredit += Number(entry.jumlah);
        balances.set(entry.chartOfAccountId, current);
      }
    });

    // Hitung saldo normal
    const result = coas.map(coa => {
      const b = balances.get(coa.id)!;
      let saldo = 0;
      if (coa.kategori === KategoriAkun.ASET || coa.kategori === KategoriAkun.BEBAN) {
        saldo = b.debit - b.kredit; // Saldo normal Debit
      } else {
        saldo = b.kredit - b.debit; // Saldo normal Kredit
      }
      return {
        coa,
        debit: b.debit,
        kredit: b.kredit,
        saldo,
      };
    });

    return result;
  }

  // 1. Neraca Saldo (Trial Balance)
  async getTrialBalance(tenantId: string, startDate?: string, endDate?: string, dimensionValues?: string) {
    const balances = await this.getAccountBalances(tenantId, startDate, endDate, dimensionValues);
    let totalDebit = 0;
    let totalKredit = 0;

    balances.forEach(b => {
      totalDebit += b.debit;
      totalKredit += b.kredit;
    });

    return {
      items: balances,
      totalDebit,
      totalKredit,
      isBalanced: totalDebit === totalKredit,
    };
  }

  // 2. Neraca (Balance Sheet)
  async getBalanceSheet(tenantId: string, date?: string) {
    // Neraca mengambil saldo dari awal waktu sampai 'date'
    const balances = await this.getAccountBalances(tenantId, undefined, date);

    const aset = balances.filter(b => b.coa.kategori === KategoriAkun.ASET);
    const liabilitas = balances.filter(b => b.coa.kategori === KategoriAkun.LIABILITAS);
    const ekuitas = balances.filter(b => b.coa.kategori === KategoriAkun.EKUITAS);
    const pendapatan = balances.filter(b => b.coa.kategori === KategoriAkun.PENDAPATAN);
    const beban = balances.filter(b => b.coa.kategori === KategoriAkun.BEBAN);

    const totalAset = aset.reduce((sum, b) => sum + b.saldo, 0);
    const totalLiabilitas = liabilitas.reduce((sum, b) => sum + b.saldo, 0);
    const totalEkuitasAwal = ekuitas.reduce((sum, b) => sum + b.saldo, 0);

    // Hitung Laba Bersih Tahun Berjalan
    const totalPendapatan = pendapatan.reduce((sum, b) => sum + b.saldo, 0);
    const totalBeban = beban.reduce((sum, b) => sum + b.saldo, 0);
    const labaBersihBerjalan = totalPendapatan - totalBeban;

    const totalEkuitas = totalEkuitasAwal + labaBersihBerjalan;

    return {
      aset,
      liabilitas,
      ekuitas,
      labaBersihBerjalan,
      totalAset,
      totalLiabilitas,
      totalEkuitas,
      totalPasiva: totalLiabilitas + totalEkuitas, // Harus sama dengan totalAset
      isBalanced: totalAset === (totalLiabilitas + totalEkuitas),
    };
  }

  // 3. Laba Rugi (Income Statement)
  async getIncomeStatement(tenantId: string, startDate?: string, endDate?: string, compStartDate?: string, compEndDate?: string) {
    const mainBalances = await this.getAccountBalances(tenantId, startDate, endDate);
    
    let compBalances = [];
    if (compStartDate && compEndDate) {
      compBalances = await this.getAccountBalances(tenantId, compStartDate, compEndDate);
    }

    const processIS = (bals: any[]) => {
      const pendapatan = bals.filter(b => b.coa.kategori === KategoriAkun.PENDAPATAN);
      const beban = bals.filter(b => b.coa.kategori === KategoriAkun.BEBAN);

      const totalPendapatan = pendapatan.reduce((sum, b) => sum + b.saldo, 0);
      const totalBeban = beban.reduce((sum, b) => sum + b.saldo, 0);
      return {
        pendapatan,
        beban,
        totalPendapatan,
        totalBeban,
        labaBersih: totalPendapatan - totalBeban,
      };
    };

    const mainIS = processIS(mainBalances);
    const compIS = compBalances.length > 0 ? processIS(compBalances) : null;

    return {
      main: mainIS,
      comparison: compIS,
      hasComparison: !!compIS,
    };
  }

  // 4. Arus Kas (Cash Flow) - Metode Tidak Langsung (Indirect Method MVP)
  async getCashFlowStatement(tenantId: string, startDate: string, endDate: string) {
    // Ambil Laba Bersih di periode ini
    const incomeStmt = await this.getIncomeStatement(tenantId, startDate, endDate);
    const labaBersih = incomeStmt.main.labaBersih;

    // Untuk arus kas tidak langsung, kita butuh mutasi saldo dari awal periode ke akhir periode
    // Namun yang paling sederhana: saldo(endDate) - saldo(startDate - 1 hari)
    // Di sini kita simplifikasi menggunakan mutasi selama rentang startDate - endDate
    const mutasi = await this.getAccountBalances(tenantId, startDate, endDate);

    const penyesuaianOperasional = [];
    let netOperasional = labaBersih;

    // Asumsi: 
    // - Akun kas adalah aset dengan nama mengandung 'kas' atau 'bank'
    // - Aset lain (Peralatan, Piutang) masuk penyesuaian (kenaikan aset -> kas turun)
    // - Liabilitas (Hutang) masuk penyesuaian (kenaikan hutang -> kas naik)
    
    mutasi.forEach(b => {
      const nama = b.coa.nama_akun.toLowerCase();
      const isKas = nama.includes('kas') || nama.includes('bank');

      if (!isKas && b.saldo !== 0) {
        if (b.coa.kategori === KategoriAkun.ASET) {
          // Kenaikan aset non-kas mengurangi arus kas
          const adj = -b.saldo; 
          penyesuaianOperasional.push({
            akun: b.coa.nama_akun,
            nilai: adj,
            keterangan: adj < 0 ? 'Kenaikan Aset' : 'Penurunan Aset'
          });
          netOperasional += adj;
        } else if (b.coa.kategori === KategoriAkun.LIABILITAS) {
          // Kenaikan liabilitas menambah arus kas
          const adj = b.saldo;
          penyesuaianOperasional.push({
            akun: b.coa.nama_akun,
            nilai: adj,
            keterangan: adj > 0 ? 'Kenaikan Liabilitas' : 'Penurunan Liabilitas'
          });
          netOperasional += adj;
        }
      }
    });

    // Untuk MVP kita letakkan semua di Aktivitas Operasi
    return {
      labaBersih,
      aktivitasOperasi: {
        penyesuaian: penyesuaianOperasional,
        netKas: netOperasional,
      },
      aktivitasInvestasi: { netKas: 0 },
      aktivitasPendanaan: { netKas: 0 },
      netKenaikanKas: netOperasional,
    };
  }

  // 5. Laba Rugi per Dimensi (V2 Delta)
  async getIncomeStatementByDimension(tenantId: string, dimensionId: string, startDate?: string, endDate?: string) {
    const coas = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, isActive: true, kategori: { in: [KategoriAkun.PENDAPATAN, KategoriAkun.BEBAN] } },
      orderBy: { kode_akun: 'asc' },
    });

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const dimensionValues = await this.prisma.dimensionValue.findMany({
      where: { dimensionId, isActive: true },
    });

    const entries = await this.prisma.journalEntryDimension.findMany({
      where: {
        dimensionId,
        journalEntry: {
          journal: {
            tenantId,
            status: { in: ['POSTED', 'APPROVED'] },
            tanggal: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
          }
        }
      },
      include: {
        journalEntry: {
          include: {
            chartOfAccount: true
          }
        },
        dimensionValue: true
      }
    });

    const reportByDimension: any = {};

    dimensionValues.forEach(dv => {
      reportByDimension[dv.id] = {
        dimensionValue: { id: dv.id, kode: dv.kode, nama: dv.nama },
        pendapatan: [],
        beban: [],
        totalPendapatan: 0,
        totalBeban: 0,
        labaBersih: 0,
        balances: new Map<string, { debit: number, kredit: number, saldo: number, coa: any }>(),
      };
      coas.forEach(coa => {
        reportByDimension[dv.id].balances.set(coa.id, { debit: 0, kredit: 0, saldo: 0, coa });
      });
    });

    entries.forEach(jed => {
      const dvId = jed.dimensionValueId;
      if (!reportByDimension[dvId]) return;
      const entry = jed.journalEntry;
      if (entry.chartOfAccount.kategori !== KategoriAkun.PENDAPATAN && entry.chartOfAccount.kategori !== KategoriAkun.BEBAN) return;

      const current = reportByDimension[dvId].balances.get(entry.chartOfAccountId);
      if (current) {
        if (entry.tipe === 'DEBIT') current.debit += Number(entry.jumlah);
        if (entry.tipe === 'KREDIT') current.kredit += Number(entry.jumlah);
        reportByDimension[dvId].balances.set(entry.chartOfAccountId, current);
      }
    });

    const result = [];
    dimensionValues.forEach(dv => {
      const rep = reportByDimension[dv.id];
      const bals = Array.from(rep.balances.values());

      bals.forEach((b: any) => {
        let saldo = 0;
        if (b.coa.kategori === KategoriAkun.BEBAN) {
          saldo = b.debit - b.kredit;
        } else {
          saldo = b.kredit - b.debit;
        }
        b.saldo = saldo;

        if (b.coa.kategori === KategoriAkun.PENDAPATAN && (b.debit !== 0 || b.kredit !== 0)) {
          rep.pendapatan.push(b);
          rep.totalPendapatan += saldo;
        } else if (b.coa.kategori === KategoriAkun.BEBAN && (b.debit !== 0 || b.kredit !== 0)) {
          rep.beban.push(b);
          rep.totalBeban += saldo;
        }
      });

      rep.labaBersih = rep.totalPendapatan - rep.totalBeban;
      delete rep.balances;
      result.push(rep);
    });

    return result;
  }

  // 6. Analisa Per Dimensi (Pivot Matrix: Row COA, Column Dimensi, Cell Saldo)
  async getDimensionAnalysisMatrix(
    tenantId: string,
    query: {
      dimensionId: string;
      tipeSaldo?: 'AS_OF' | 'MUTASI';
      startDate?: string;
      endDate: string;
      kategori?: string;
    },
  ) {
    const { dimensionId, tipeSaldo = 'MUTASI', startDate, endDate, kategori } = query;

    if (!dimensionId) {
      throw new BadRequestException('Parameter dimensionId wajib diisi');
    }

    const dimension = await this.prisma.dimension.findFirst({
      where: { id: dimensionId, tenantId },
      include: {
        values: {
          where: { isActive: true },
          orderBy: { kode: 'asc' },
        },
      },
    });

    if (!dimension) {
      throw new NotFoundException('Dimensi tidak ditemukan');
    }

    const coaWhere: any = { tenantId, isActive: true };
    if (kategori && kategori !== 'ALL' && kategori !== 'SEMUA') {
      coaWhere.kategori = kategori as KategoriAkun;
    }

    const coas = await this.prisma.chartOfAccount.findMany({
      where: coaWhere,
      orderBy: { kode_akun: 'asc' },
    });

    const coaMap = new Map<string, any>();
    coas.forEach((c) => coaMap.set(c.id, c));

    // Filter tanggal
    const dateFilter: any = {};
    if (tipeSaldo === 'MUTASI') {
      if (startDate) {
        dateFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        dateFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    } else {
      // AS_OF: kumulatif s.d endDate
      if (endDate) {
        dateFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: { in: coas.map((c) => c.id) },
        journal: {
          tenantId,
          status: { in: ['POSTED', 'APPROVED'] },
          tanggal: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        },
      },
      select: {
        chartOfAccountId: true,
        tipe: true,
        jumlah: true,
        dimensions: {
          where: { dimensionId },
          select: { dimensionValueId: true },
        },
      },
    });

    // Inisialisasi struktur matriks baris COA
    const matrixRows = new Map<
      string,
      {
        coa: any;
        values: Record<string, number>;
        total: number;
      }
    >();

    coas.forEach((c) => {
      const initialValues: Record<string, number> = { UNASSIGNED: 0 };
      dimension.values.forEach((dv) => {
        initialValues[dv.id] = 0;
      });
      matrixRows.set(c.id, {
        coa: {
          id: c.id,
          kode_akun: c.kode_akun,
          nama_akun: c.nama_akun,
          kategori: c.kategori,
          isControlAccount: c.isControlAccount,
        },
        values: initialValues,
        total: 0,
      });
    });

    // Inisialisasi Column Totals
    const columnTotals: Record<string, number> = { UNASSIGNED: 0 };
    dimension.values.forEach((dv) => {
      columnTotals[dv.id] = 0;
    });
    let grandTotal = 0;

    // Hitung kontribusi saldo setiap entri
    for (const entry of entries) {
      const coa = coaMap.get(entry.chartOfAccountId);
      if (!coa) continue;

      const isNormalDebit =
        coa.kategori === KategoriAkun.ASET || coa.kategori === KategoriAkun.BEBAN;
      const amt = Number(entry.jumlah);
      const signedAmt =
        entry.tipe === 'DEBIT'
          ? isNormalDebit ? amt : -amt
          : isNormalDebit ? -amt : amt;

      const dimValId = entry.dimensions[0]?.dimensionValueId || 'UNASSIGNED';

      const row = matrixRows.get(entry.chartOfAccountId);
      if (row) {
        row.values[dimValId] = (row.values[dimValId] || 0) + signedAmt;
        row.total += signedAmt;
      }

      columnTotals[dimValId] = (columnTotals[dimValId] || 0) + signedAmt;
      grandTotal += signedAmt;
    }

    const rows = Array.from(matrixRows.values());

    return {
      dimension: {
        id: dimension.id,
        nama_dimension: dimension.nama_dimension,
      },
      columns: dimension.values.map((v) => ({
        id: v.id,
        kode: v.kode,
        nama: v.nama,
      })),
      hasUnassigned: rows.some((r) => r.values['UNASSIGNED'] !== 0),
      rows,
      columnTotals,
      grandTotal,
    };
  }
}
