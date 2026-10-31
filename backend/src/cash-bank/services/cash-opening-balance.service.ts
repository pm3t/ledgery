import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportCashOpeningBalanceDto } from '../dto/cash-opening-balance.dto';
import {
  CashBankEntryDirection,
  CashBankSourceType,
  KategoriAkun,
} from '@prisma/client';

@Injectable()
export class CashOpeningBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil perbandingan saldo GL saat ini vs saldo awal sub ledger per rekening kas & bank.
   */
  async getOpeningBalanceStatus(tenantId: string) {
    const accounts = await this.prisma.cashBankAccount.findMany({
      where: { tenantId },
      include: {
        chartOfAccount: true,
      },
      orderBy: { kode: 'asc' },
    });

    const results = [];

    for (const acc of accounts) {
      // 1. Saldo subledger kas & bank saat ini
      const entries = await this.prisma.cashBankEntry.findMany({
        where: { cashBankAccountId: acc.id },
        select: { arah: true, jumlah: true, sourceType: true },
      });

      let saldoSubledger = 0;
      let saldoAwalTercatat = 0;
      for (const e of entries) {
        const amt = Number(e.jumlah);
        if (e.arah === CashBankEntryDirection.MASUK) {
          saldoSubledger += amt;
        } else {
          saldoSubledger -= amt;
        }
        if (e.sourceType === CashBankSourceType.OPENING) {
          saldoAwalTercatat += e.arah === CashBankEntryDirection.MASUK ? amt : -amt;
        }
      }

      // 2. Saldo GL Buku Besar saat ini
      const glEntries = await this.prisma.journalEntry.findMany({
        where: {
          chartOfAccountId: acc.chartOfAccountId,
          journal: { tenantId, status: 'POSTED' },
        },
        select: { tipe: true, jumlah: true },
      });

      let saldoGL = 0;
      for (const ge of glEntries) {
        const amt = Number(ge.jumlah);
        saldoGL += ge.tipe === 'DEBIT' ? amt : -amt;
      }

      const selisih = saldoSubledger - saldoGL;
      const reconciled = Math.abs(selisih) < 0.001;

      results.push({
        cashBankAccountId: acc.id,
        kodeRekening: acc.kode,
        namaRekening: acc.nama,
        jenis: acc.jenis,
        mataUang: acc.mata_uang,
        chartOfAccountId: acc.chartOfAccountId,
        kodeAkunGL: acc.chartOfAccount.kode_akun,
        namaAkunGL: acc.chartOfAccount.nama_akun,
        saldoAwalTercatat,
        saldoSubledger,
        saldoGL,
        selisih,
        reconciled,
        status: reconciled ? 'Cocok (Rekonsiliasi)' : 'Terdapat Selisih',
      });
    }

    return results;
  }

  /**
   * Mengimpor saldo awal rekening kas & bank pada tanggal go-live.
   * Langsung membentuk record CashBankEntry ber-sourceType OPENING tanpa membuat jurnal baru.
   */
  async importOpeningBalance(tenantId: string, dto: ImportCashOpeningBalanceDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Data baris saldo awal tidak boleh kosong');
    }

    const tanggal = new Date(dto.tanggal);

    return await this.prisma.$transaction(async (tx) => {
      const results = [];

      for (const item of dto.items) {
        const account = await tx.cashBankAccount.findFirst({
          where: { id: item.cashBankAccountId, tenantId },
          include: { chartOfAccount: true },
        });

        if (!account) {
          throw new NotFoundException(
            `Rekening dengan ID '${item.cashBankAccountId}' tidak ditemukan`,
          );
        }

        const saldoAwal = Number(item.saldoAwal);
        const arah =
          saldoAwal >= 0
            ? CashBankEntryDirection.MASUK
            : CashBankEntryDirection.KELUAR;
        const absJumlah = Math.abs(saldoAwal);

        // Hapus saldo awal OPENING lama jika ada untuk rekening ini
        await tx.cashBankEntry.deleteMany({
          where: {
            cashBankAccountId: item.cashBankAccountId,
            sourceType: CashBankSourceType.OPENING,
          },
        });

        const createdEntry = await tx.cashBankEntry.create({
          data: {
            tenantId,
            cashBankAccountId: account.id,
            tanggal,
            arah,
            jumlah: absJumlah,
            jumlahFungsional: absJumlah,
            sourceType: CashBankSourceType.OPENING,
            keterangan: item.keterangan || 'Saldo Awal Cut-Off Go-Live Kas & Bank',
          },
        });

        results.push(createdEntry);
      }

      return results;
    });
  }
}

