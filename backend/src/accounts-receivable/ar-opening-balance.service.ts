import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpeningBalanceImportDto } from './dto/opening-balance.dto';
import { SalesInvoiceStatus, PostingSetupKey, EntryType } from '@prisma/client';

@Injectable()
export class ArOpeningBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Impor faktur saldo awal piutang per tanggal go-live tanpa membentuk jurnal GL baru,
   * dan memvalidasi totalnya terhadap saldo GL akun AR_CONTROL pada tanggal tersebut.
   */
  async importOpeningBalance(tenantId: string, dto: OpeningBalanceImportDto) {
    const asOf = new Date(dto.asOfDate);

    // 1. Ambil akun AR_CONTROL dari PostingSetup
    const setup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: PostingSetupKey.AR_CONTROL, groupCode: null },
      include: { account: true },
    });

    if (!setup || !setup.account) {
      throw new BadRequestException(
        'Akun kontrol Piutang (AR_CONTROL) belum dipetakan di Posting Setup tenant ini.',
      );
    }

    const arAccount = setup.account;

    // 2. Hitung saldo buku besar (GL) akun AR_CONTROL per asOfDate
    const glEntries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: arAccount.id,
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
    const currentGlBalance = glDebit - glKredit;

    // 3. Validasi mitra bisnis dan hitung total saldo awal faktur
    let totalImportedFungsional = 0;
    const partnerCodes = [...new Set(dto.invoices.map((i) => i.partnerKode))];
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
          `Mitra bisnis dengan kode '${code}' tidak ditemukan di tenant ini. Buat terlebih dahulu master mitra bisnis.`,
        );
      }
    }

    const invoicesToCreate: any[] = [];
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    for (const item of dto.invoices) {
      const partner = partnerMap.get(item.partnerKode)!;
      const kurs = item.kurs || 1;
      const saldo = Number(item.saldo);
      const saldoFungsional = saldo * kurs;
      totalImportedFungsional += saldoFungsional;

      invoicesToCreate.push({
        tenantId,
        noDokumen: item.noDokumen,
        tanggal: new Date(item.tanggal),
        jatuhTempo: new Date(item.jatuhTempo),
        partnerId: partner.id,
        mata_uang: item.mata_uang || tenant?.mata_uang || 'IDR',
        kurs,
        status: SalesInvoiceStatus.POSTED,
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
        catatan: item.catatan || 'Saldo Awal Piutang (Migrasi / Go-Live)',
        externalRef: item.externalRef || null,
        postedAt: new Date(),
        lines: {
          create: [
            {
              deskripsi: item.catatan || 'Saldo Awal Piutang',
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
    const createdInvoices = await this.prisma.$transaction(async (tx) => {
      const results: any[] = [];
      for (const invData of invoicesToCreate) {
        const inv = await tx.salesInvoice.create({
          data: invData,
        });
        results.push(inv);
      }
      return results;
    });

    return {
      message: 'Impor saldo awal piutang berhasil diproses.',
      asOfDate: dto.asOfDate,
      arControlAccount: {
        kode: arAccount.kode_akun,
        nama: arAccount.nama_akun,
      },
      currentGlBalance,
      totalImportedSubledger: totalImportedFungsional,
      selisih,
      statusRekonsiliasi: isReconciled ? 'RECONCILED' : 'SELISIH',
      keterangan: isReconciled
        ? 'Saldo buku besar akun AR_CONTROL dan subledger piutang sepenuhnya cocok (Balance).'
        : `Terdapat selisih sebesar ${new Intl.NumberFormat('id-ID').format(selisih)} antara GL dan Subledger. Segera sesuaikan jurnal pembukaan agar neraca dan buku pembantu cocok.`,
      jumlahFakturDiimpor: createdInvoices.length,
    };
  }
}

