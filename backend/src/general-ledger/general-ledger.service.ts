import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeneralLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  // Menampilkan mutasi Buku Besar (General Ledger) untuk satu akun
  async getAccountLedger(tenantId: string, accountId: string, startDate?: string, endDate?: string, dimensionValues?: string) {
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
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

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
      },
      orderBy: {
        journal: {
          tanggal: 'asc', // Urutkan berdasarkan tanggal tertua ke terbaru
        },
      },
    });

    // Kalkulasi saldo berjalan (Running Balance)
    let runningBalance = 0;
    const ledgerLines = entries.map((entry) => {
      const amount = Number(entry.jumlah);
      if (entry.tipe === 'DEBIT') {
        runningBalance = isNormalDebit ? runningBalance + amount : runningBalance - amount;
      } else {
        // KREDIT
        runningBalance = isNormalDebit ? runningBalance - amount : runningBalance + amount;
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
      };
    });

    return {
      akun: account,
      normalBalance: isNormalDebit ? 'DEBIT' : 'KREDIT',
      totalMutasi: ledgerLines.length,
      saldoAkhir: runningBalance,
      mutasi: ledgerLines,
    };
  }
}
