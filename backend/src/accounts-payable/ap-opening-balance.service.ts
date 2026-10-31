import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApOpeningBalanceImportDto } from './dto/opening-balance.dto';
import { PurchaseBillStatus, PostingSetupKey, EntryType } from '@prisma/client';

@Injectable()
export class ApOpeningBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Impor faktur saldo awal hutang per tanggal go-live tanpa membentuk jurnal GL baru,
   * dan memvalidasi totalnya terhadap saldo GL akun AP_CONTROL pada tanggal tersebut.
   */
  async importOpeningBalance(tenantId: string, dto: ApOpeningBalanceImportDto) {
    const asOf = new Date(dto.asOfDate);

    // 1. Ambil akun AP_CONTROL dari PostingSetup
    const setup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: PostingSetupKey.AP_CONTROL, groupCode: null },
      include: { account: true },
    });

    if (!setup || !setup.account) {
      throw new BadRequestException(
        'Akun kontrol Hutang (AP_CONTROL) belum dipetakan di Posting Setup tenant ini.',
      );
    }

    const apAccount = setup.account;

    // 2. Hitung saldo buku besar (GL) akun AP_CONTROL per asOfDate (Saldo normal liabilitas = KREDIT)
    const glEntries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: apAccount.id,
        journal: {
          tenantId,
          tanggal: { lte: asOf },
          status: 'POSTED',
        },
      },
    });

    let glDebit = 0;
    let glKredit = 0;
    for (const e of glEntries) {
      const val = Number(e.jumlah);
      if (e.tipe === EntryType.DEBIT) glDebit += val;
      if (e.tipe === EntryType.KREDIT) glKredit += val;
    }
    const currentGlBalance = glKredit - glDebit; // Saldo normal Kredit untuk Hutang

    // 3. Validasi vendor dan hitung total saldo awal faktur pembelian
    let totalImportedFungsional = 0;
    const partnerCodes = [...new Set(dto.bills.map((b) => b.partnerKode))];
    const partners = await this.prisma.businessPartner.findMany({
      where: {
        tenantId,
        kode: { in: partnerCodes },
      },
    });

    const partnerMap = new Map(partners.map((p) => [p.kode, p]));

    for (const code of partnerCodes) {
      if (!partnerMap.has(code)) {
        throw new NotFoundException(
          `Vendor dengan kode '${code}' tidak ditemukan di tenant ini. Buat terlebih dahulu master mitra bisnis.`,
        );
      }
    }

    const billsToCreate: any[] = [];
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    for (const item of dto.bills) {
      const partner = partnerMap.get(item.partnerKode)!;
      const kurs = item.kurs || 1;
      const saldo = Number(item.saldo);
      const saldoFungsional = saldo * kurs;
      totalImportedFungsional += saldoFungsional;

      billsToCreate.push({
        tenantId,
        noDokumen: item.noDokumen,
        noFakturVendor: item.noFakturVendor || null,
        nomorFakturPajakMasukan: item.nomorFakturPajakMasukan || null,
        tanggal: new Date(item.tanggal),
        jatuhTempo: new Date(item.jatuhTempo),
        partnerId: partner.id,
        mata_uang: item.mata_uang || tenant?.mata_uang || 'IDR',
        kurs,
        status: PurchaseBillStatus.POSTED,
        subtotal: saldo,
        totalDiskon: 0,
        totalPpn: 0,
        total: saldo,
        saldo: saldo,
        totalDialokasikan: 0,
        subtotalFungsional: saldoFungsional,
        totalDiskonFungsional: 0,
        totalPpnFungsional: 0,
        totalFungsional: saldoFungsional,
        saldoFungsional: saldoFungsional,
        journalId: null, // Tanpa jurnal GL baru
        sumberAplikasi: 'OPENING_BALANCE_IMPORT',
        catatan: item.catatan || 'Saldo Awal Hutang (Migrasi / Go-Live)',
        externalRef: item.externalRef || null,
        postedAt: new Date(),
        lines: {
          create: [
            {
              deskripsi: item.catatan || 'Saldo Awal Hutang',
              qty: 1,
              hargaSatuan: saldo,
              jumlah: saldo,
              itemType: 'SERVICE',
            },
          ],
        },
      });
    }

    // 4. Hitung selisih rekonsiliasi GL vs Subledger
    const selisih = totalImportedFungsional - currentGlBalance;
    const isReconciled = Math.abs(selisih) < 0.01;

    // 5. Simpan faktur-faktur saldo awal dalam transaksi database
    const createdBills = await this.prisma.$transaction(async (tx) => {
      const results: any[] = [];
      for (const billData of billsToCreate) {
        const bill = await tx.purchaseBill.create({
          data: billData,
        });
        results.push(bill);
      }
      return results;
    });

    return {
      message: 'Impor saldo awal hutang berhasil diproses.',
      asOfDate: dto.asOfDate,
      apControlAccount: {
        kode: apAccount.kode_akun,
        nama: apAccount.nama_akun,
      },
      currentGlBalance,
      totalImportedSubledger: totalImportedFungsional,
      selisih,
      statusRekonsiliasi: isReconciled ? 'RECONCILED' : 'SELISIH',
      keterangan: isReconciled
        ? 'Saldo buku besar akun AP_CONTROL dan subledger hutang sepenuhnya cocok (Balance).'
        : `Terdapat selisih sebesar ${new Intl.NumberFormat('id-ID').format(selisih)} antara GL dan Subledger. Segera sesuaikan jurnal pembukaan agar neraca dan buku pembantu hutang cocok.`,
      jumlahFakturDiimpor: createdBills.length,
    };
  }
}

