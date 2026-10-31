import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubledgerPostingService } from '../../subledger/subledger-posting.service';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import { InventoryStockService } from './inventory-stock.service';
import { ImportStockOpeningBalanceDto } from '../dto/inventory-opening-balance.dto';

@Injectable()
export class InventoryOpeningBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly periodService: AccountingPeriodService,
    private readonly stockService: InventoryStockService,
  ) {}

  async importOpeningBalance(tenantId: string, dto: ImportStockOpeningBalanceDto) {
    await this.stockService.ensureInventoryEnabled(tenantId);

    const asOfDate = new Date(dto.asOfDate);
    await this.periodService.validateJournalDate(tenantId, asOfDate);

    // 1. Ambil akun kontrol persediaan (INVENTORY)
    const invSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: 'INVENTORY' },
      include: { account: true },
    });
    if (!invSetup?.account) {
      throw new BadRequestException(
        'Akun kontrol Persediaan (INVENTORY) belum dipetakan di Posting Setup Subledger.',
      );
    }
    const invControlAccount = invSetup.account;

    let totalImportedSubledger = 0;
    const importedMovements = [];

    // 2. Simpan setiap baris saldo awal
    for (let i = 0; i < dto.items.length; i++) {
      const row = dto.items[i];
      const item = await this.prisma.item.findUnique({
        where: { tenantId_kode: { tenantId, kode: row.itemKode } },
      });
      if (!item) {
        throw new NotFoundException(
          `Baris ${i + 1}: Barang dengan kode "${row.itemKode}" tidak ditemukan.`,
        );
      }

      const warehouse = await this.prisma.warehouse.findUnique({
        where: { tenantId_kode: { tenantId, kode: row.warehouseKode } },
      });
      if (!warehouse) {
        throw new NotFoundException(
          `Baris ${i + 1}: Gudang dengan kode "${row.warehouseKode}" tidak ditemukan.`,
        );
      }

      const lineTotal = Math.round(Number(row.qty) * Number(row.biayaSatuan) * 100) / 100;
      totalImportedSubledger += lineTotal;

      const receiptDate = row.tanggalMasuk ? new Date(row.tanggalMasuk) : asOfDate;

      const res = await this.stockService.executeReceipt(tenantId, {
        tenantId,
        itemId: item.id,
        warehouseId: warehouse.id,
        qty: Number(row.qty),
        nilaiMasuk: lineTotal,
        tanggal: receiptDate,
        sourceDocType: 'OPENING_BALANCE',
        sourceDocId: `OB-${row.itemKode}-${row.warehouseKode}`,
        tipeMovement: 'OPENING',
        biayaSatuanKhusus: Number(row.biayaSatuan),
        createdBy: 'MIGRATION_OPENING_BALANCE',
      });

      importedMovements.push(res);
    }

    // 3. Rekonsiliasi terhadap saldo akun GL (Buku Besar) per asOfDate
    const glEntries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: invControlAccount.id,
        journal: {
          tenantId,
          status: 'POSTED',
          tanggal: { lte: asOfDate },
        },
      },
    });

    let glDebit = 0;
    let glKredit = 0;
    for (const ent of glEntries) {
      if (ent.tipe === 'DEBIT') glDebit += Number(ent.jumlah);
      else glKredit += Number(ent.jumlah);
    }

    // Saldo normal Persediaan (Aset) adalah DEBIT
    const currentGlBalance = Math.round((glDebit - glKredit) * 100) / 100;
    const roundedSubledgerTotal = Math.round(totalImportedSubledger * 100) / 100;
    const selisih = Math.round((currentGlBalance - roundedSubledgerTotal) * 100) / 100;

    const isReconciled = Math.abs(selisih) < 0.01;

    return {
      message: 'Saldo awal persediaan berhasil diimpor ke sub ledger.',
      asOfDate: dto.asOfDate,
      inventoryControlAccount: {
        id: invControlAccount.id,
        kode: invControlAccount.kode_akun,
        nama: invControlAccount.nama_akun,
      },
      currentGlBalance,
      totalImportedSubledger: roundedSubledgerTotal,
      selisih,
      statusRekonsiliasi: isReconciled ? 'RECONCILED' : 'SELISIH',
      keterangan: isReconciled
        ? 'Saldo sub ledger persediaan sama persis dengan saldo akun kontrol GL (Buku Besar).'
        : `Ditemukan selisih sebesar ${Math.abs(selisih)} antara akun kontrol GL (${currentGlBalance}) dan total sub ledger diimpor (${roundedSubledgerTotal}). Pastikan neraca awal GL telah mencatat nilai persediaan yang sesuai.`,
      jumlahBarisDiimpor: importedMovements.length,
    };
  }
}
