import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeneralLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  // Menampilkan mutasi Buku Besar (General Ledger) untuk satu akun
  async getAccountLedger(
    tenantId: string,
    accountId: string,
    startDate?: string,
    endDate?: string,
    dimensionValues?: string,
    deskripsi?: string,
  ) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: { id: accountId },
    });

    if (!account || account.tenantId !== tenantId) {
      throw new NotFoundException(`Akun tidak ditemukan untuk tenant ini`);
    }

    // Menentukan Normal Balance berdasarkan kategori
    const isNormalDebit = account.kategori === 'ASET' || account.kategori === 'BEBAN';

    // Filter tanggal
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59.999Z`);

    const whereClause: any = {
      chartOfAccountId: accountId,
      journal: {
        status: { in: ['POSTED', 'APPROVED'] }, // Masukkan jurnal POSTED dan APPROVED
        tenantId,
      },
    };

    if (startDate || endDate) {
      whereClause.journal.tanggal = dateFilter;
    }

    if (deskripsi && deskripsi.trim()) {
      whereClause.journal.deskripsi = { contains: deskripsi.trim(), mode: 'insensitive' };
    }

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

    // Ambil mutasi yang relevan
    const entries = await this.prisma.journalEntry.findMany({
      where: whereClause,
      include: {
        journal: {
          select: { no_voucher: true, tanggal: true, deskripsi: true, sumber_aplikasi: true },
        },
        dimensions: {
          include: {
            dimensionValue: {
              include: {
                dimension: true,
              },
            },
          },
        },
      },
      orderBy: {
        journal: {
          tanggal: 'asc', // Urutkan berdasarkan tanggal tertua ke terbaru
        },
      },
    });

    // Kalkulasi saldo berjalan (Running Balance) dan total debit/kredit
    let runningBalance = 0;
    let totalDebit = 0;
    let totalKredit = 0;

    const ledgerLines = entries.map((entry) => {
      const amount = Number(entry.jumlah);
      if (entry.tipe === 'DEBIT') {
        runningBalance = isNormalDebit ? runningBalance + amount : runningBalance - amount;
        totalDebit += amount;
      } else {
        // KREDIT
        runningBalance = isNormalDebit ? runningBalance - amount : runningBalance + amount;
        totalKredit += amount;
      }

      return {
        id: entry.id,
        tanggal: entry.journal.tanggal,
        no_voucher: entry.journal.no_voucher,
        deskripsi: entry.journal.deskripsi,
        sumber_aplikasi: entry.journal.sumber_aplikasi,
        debit: entry.tipe === 'DEBIT' ? amount : 0,
        kredit: entry.tipe === 'KREDIT' ? amount : 0,
        saldo_berjalan: runningBalance,
        dimensions: entry.dimensions?.map((d) => ({
          dimensionName: d.dimensionValue?.dimension?.nama_dimension,
          valueName: d.dimensionValue?.nama,
          valueCode: d.dimensionValue?.kode,
        })) || [],
      };
    });

    return {
      akun: account,
      normalBalance: isNormalDebit ? 'DEBIT' : 'KREDIT',
      totalMutasi: ledgerLines.length,
      totalDebit,
      totalKredit,
      saldoAkhir: runningBalance,
      mutasi: ledgerLines,
    };
  }
}
