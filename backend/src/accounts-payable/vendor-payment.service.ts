import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import {
  CreateVendorPaymentDto,
  CreatePaymentAllocationDto,
} from './dto/vendor-payment.dto';
import {
  VendorPaymentStatus,
  PurchaseBillStatus,
  PostingSetupKey,
} from '@prisma/client';

@Injectable()
export class VendorPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly accountingPeriodService: AccountingPeriodService,
  ) {}

  /**
   * Mengambil pemetaan akun dari PostingSetup
   */
  private async getPostingAccount(
    tenantId: string,
    key: PostingSetupKey,
    groupCode?: string,
  ) {
    if (groupCode) {
      const override = await this.prisma.postingSetup.findFirst({
        where: { tenantId, key, groupCode },
        include: { account: true },
      });
      if (override) return override.account;
    }

    const defaultSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key, groupCode: null },
      include: { account: true },
    });

    return defaultSetup?.account || null;
  }

  /**
   * Membuat dan langsung memposting Pembayaran ke Vendor
   */
  async createAndPostPayment(
    tenantId: string,
    dto: CreateVendorPaymentDto,
    userName?: string,
  ) {
    // 1. Dukungan Idempotency Replay
    if (dto.idempotencyKey) {
      const existing = await this.prisma.vendorPayment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: { allocations: true, partner: true, akunKasBank: true },
      });
      if (existing) {
        return existing;
      }
    }

    // 2. Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(dto.tanggal),
    );

    // 3. Validasi Vendor
    const partner = await this.prisma.businessPartner.findUnique({
      where: { id: dto.partnerId },
    });
    if (!partner || partner.tenantId !== tenantId) {
      throw new NotFoundException('Vendor tidak ditemukan');
    }
    if (!partner.isActive) {
      throw new BadRequestException(`Vendor '${partner.nama}' sedang tidak aktif.`);
    }

    // 4. Validasi Akun Kas/Bank
    const akunKasBank = await this.prisma.chartOfAccount.findUnique({
      where: { id: dto.akunKasBankId },
    });
    if (!akunKasBank || akunKasBank.tenantId !== tenantId) {
      throw new NotFoundException('Akun Kas / Bank tidak ditemukan');
    }
    if (!akunKasBank.isActive) {
      throw new BadRequestException(`Akun '${akunKasBank.kode_akun}' sedang tidak aktif.`);
    }

    // 5. Validasi Mata Uang & Kurs
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const mataUang = dto.mata_uang || tenant?.mata_uang || 'IDR';
    const paymentKurs = dto.kurs || 1;
    const jumlah = Number(dto.jumlah);
    const jumlahFungsional = jumlah * paymentKurs;

    // 6. Ambil Akun Kontrol AP & FX dari PostingSetup
    const apControl = await this.getPostingAccount(tenantId, 'AP_CONTROL', partner.groupCode || undefined);
    const fxAccount = await this.getPostingAccount(tenantId, 'FX_GAIN_LOSS', partner.groupCode || undefined);

    if (!apControl) {
      throw new BadRequestException('Akun kontrol Hutang (AP_CONTROL) belum dipetakan di Posting Setup.');
    }

    // 7. Proses Alokasi Faktur Pembelian (Bills)
    let totalDialokasikan = 0;
    let totalSelisihKurs = 0; // Positif = Rugi Kurs (karena kurs bayar > kurs hutang), Negatif = Untung Kurs
    const processedAllocations: any[] = [];
    const billUpdates: any[] = [];

    if (dto.allocations && dto.allocations.length > 0) {
      for (const alloc of dto.allocations) {
        const alokasi = Number(alloc.jumlahAlokasi);
        if (alokasi <= 0) continue;

        if (alloc.billId) {
          const bill = await this.prisma.purchaseBill.findUnique({
            where: { id: alloc.billId },
          });

          if (!bill || bill.tenantId !== tenantId) {
            throw new NotFoundException(`Faktur pembelian ID '${alloc.billId}' tidak ditemukan.`);
          }
          if (bill.partnerId !== dto.partnerId) {
            throw new BadRequestException(
              `Faktur '${bill.noDokumen}' bukan milik vendor '${partner.nama}'.`,
            );
          }
          if (bill.status !== PurchaseBillStatus.POSTED && bill.status !== PurchaseBillStatus.PARTIAL) {
            throw new BadRequestException(
              `Faktur '${bill.noDokumen}' tidak dapat dialokasikan (Status: ${bill.status}).`,
            );
          }
          if (alokasi > Number(bill.saldo) + 0.0001) {
            throw new BadRequestException(
              `Alokasi ${alokasi} melebihi sisa saldo faktur '${bill.noDokumen}' (Saldo: ${bill.saldo}).`,
            );
          }

          // Hitung Selisih Kurs Realisasi (Untuk Liabilitas: paymentKurs > billKurs adalah RUGI kurs)
          const billKurs = Number(bill.kurs) || 1;
          const diffKurs = alokasi * (paymentKurs - billKurs);
          totalSelisihKurs += diffKurs;
          totalDialokasikan += alokasi;

          const newSaldo = Math.max(0, Number(bill.saldo) - alokasi);
          const newStatus =
            newSaldo <= 0.0001
              ? PurchaseBillStatus.PAID
              : PurchaseBillStatus.PARTIAL;

          billUpdates.push({
            id: bill.id,
            newSaldo,
            newSaldoFungsional: newSaldo * billKurs,
            totalDialokasikanBaru: Number(bill.totalDialokasikan || 0) + alokasi,
            newStatus,
          });

          processedAllocations.push({
            billId: bill.id,
            debitNoteId: null,
            jumlahAlokasi: alokasi,
            kursAlokasi: paymentKurs,
            selisihKurs: diffKurs,
          });
        }
      }
    }

    if (totalDialokasikan > jumlah + 0.0001) {
      throw new BadRequestException(
        `Total alokasi (${totalDialokasikan}) melebihi jumlah pengeluaran kas (${jumlah}).`,
      );
    }

    const belumDialokasikan = Math.max(0, jumlah - totalDialokasikan);

    // 8. Generate No Dokumen Pembayaran
    const docDate = new Date(dto.tanggal);
    const noDokumen = await this.documentNumberingService.generateNextNumber(
      tenantId,
      'AP_PAYMENT',
      'PAY',
      docDate.getFullYear(),
    );

    // 9. Susun Entri Jurnal (dalam mata uang fungsional buku besar)
    // Dr Hutang Usaha (AP_CONTROL)
    // Dr/Cr Selisih Kurs (FX_GAIN_LOSS)
    // Cr Kas / Bank = jumlah pembayaran fungsional
    const entries: any[] = [];

    // Cr Kas / Bank
    entries.push({
      kode_akun: akunKasBank.kode_akun,
      tipe: 'KREDIT',
      jumlah: jumlahFungsional,
    });

    // Dr Hutang Usaha & FX Gain/Loss
    if (totalSelisihKurs !== 0) {
      if (!fxAccount) {
        throw new BadRequestException(
          'Akun Selisih Kurs (FX_GAIN_LOSS) belum dipetakan di Posting Setup untuk mencatat selisih kurs realisasi.',
        );
      }

      if (totalSelisihKurs > 0) {
        // Rugi Selisih Kurs (bayar lebih banyak IDR untuk hutang yang sama) -> Dr FX_GAIN_LOSS
        entries.push({
          kode_akun: fxAccount.kode_akun,
          tipe: 'DEBIT',
          jumlah: totalSelisihKurs,
        });
        entries.push({
          kode_akun: apControl.kode_akun,
          tipe: 'DEBIT',
          jumlah: jumlahFungsional - totalSelisihKurs,
        });
      } else {
        // Untung Selisih Kurs (bayar lebih sedikit IDR untuk hutang yang sama) -> Cr FX_GAIN_LOSS
        const untung = Math.abs(totalSelisihKurs);
        entries.push({
          kode_akun: apControl.kode_akun,
          tipe: 'DEBIT',
          jumlah: jumlahFungsional + untung,
        });
        entries.push({
          kode_akun: fxAccount.kode_akun,
          tipe: 'KREDIT',
          jumlah: untung,
        });
      }
    } else {
      // Tidak ada selisih kurs
      entries.push({
        kode_akun: apControl.kode_akun,
        tipe: 'DEBIT',
        jumlah: jumlahFungsional,
      });
    }

    // 10. Eksekusi Posting Jurnal GL
    const journal = await this.subledgerPostingService.postSubledgerJournal(
      tenantId,
      {
        tanggal: dto.tanggal,
        deskripsi: `Pembayaran Vendor ${noDokumen} - ${partner.nama}`,
        sumber_aplikasi: 'SUBLEDGER-AP',
        sourceDocType: 'VENDOR_PAYMENT',
        sourceDocId: noDokumen,
        no_voucher: noDokumen,
        mata_uang: mataUang,
        entries,
      },
    );

    // 11. Simpan Pembayaran, Alokasi, dan Update Saldo Faktur dalam Transaksi DB
    return await this.prisma.$transaction(async (tx) => {
      // Buat dokumen pembayaran
      const payment = await tx.vendorPayment.create({
        data: {
          tenantId,
          noDokumen,
          tanggal: docDate,
          partnerId: dto.partnerId,
          akunKasBankId: dto.akunKasBankId,
          jumlah,
          jumlahFungsional,
          mata_uang: mataUang,
          kurs: paymentKurs,
          status: VendorPaymentStatus.POSTED,
          totalDialokasikan,
          belumDialokasikan,
          journalId: journal.id,
          catatan: dto.catatan,
          externalRef: dto.externalRef,
          idempotencyKey: dto.idempotencyKey,
          createdBy: userName || 'SYSTEM',
          postedAt: new Date(),
          allocations: {
            create: processedAllocations,
          },
        },
        include: {
          allocations: true,
          partner: true,
          akunKasBank: true,
          journal: true,
        },
      });

      // Update saldo & status faktur-faktur yang teralokasi
      for (const upd of billUpdates) {
        await tx.purchaseBill.update({
          where: { id: upd.id },
          data: {
            saldo: upd.newSaldo,
            saldoFungsional: upd.newSaldoFungsional,
            totalDialokasikan: upd.totalDialokasikanBaru,
            status: upd.newStatus,
          },
        });
      }

      return payment;
    });
  }

  /**
   * Membatalkan Pembayaran Vendor (Void)
   */
  async voidPayment(tenantId: string, paymentId: string, alasan: string) {
    const payment = await this.prisma.vendorPayment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: {
          include: {
            bill: true,
          },
        },
      },
    });

    if (!payment || payment.tenantId !== tenantId) {
      throw new NotFoundException('Pembayaran vendor tidak ditemukan');
    }

    if (payment.status !== VendorPaymentStatus.POSTED) {
      throw new BadRequestException('Hanya pembayaran berstatus POSTED yang dapat dibatalkan');
    }

    // Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(),
    );

    // Buat Jurnal Pembalik
    let voidJournalId: string | null = null;
    if (payment.journalId) {
      const rev = await this.subledgerPostingService.reverseJournal(
        tenantId,
        payment.journalId,
        new Date().toISOString().slice(0, 10),
        `Pembatalan Pembayaran Vendor ${payment.noDokumen}: ${alasan}`,
      );
      voidJournalId = rev.id;
    }

    return await this.prisma.$transaction(async (tx) => {
      // Pulihkan saldo faktur-faktur yang sebelumnya teralokasi
      for (const alloc of payment.allocations) {
        if (alloc.billId && alloc.bill) {
          const restoredSaldo = Number(alloc.bill.saldo) + Number(alloc.jumlahAlokasi);
          const restoredAlloc = Math.max(0, Number(alloc.bill.totalDialokasikan) - Number(alloc.jumlahAlokasi));
          const restoredStatus =
            restoredAlloc === 0
              ? PurchaseBillStatus.POSTED
              : PurchaseBillStatus.PARTIAL;

          await tx.purchaseBill.update({
            where: { id: alloc.billId },
            data: {
              saldo: restoredSaldo,
              saldoFungsional: restoredSaldo * Number(alloc.bill.kurs),
              totalDialokasikan: restoredAlloc,
              status: restoredStatus,
            },
          });
        }
      }

      // Update status pembayaran menjadi VOID
      return await tx.vendorPayment.update({
        where: { id: paymentId },
        data: {
          status: VendorPaymentStatus.VOID,
          voidJournalId,
        },
      });
    });
  }

  /**
   * Mengambil daftar pembayaran vendor per tenant
   */
  async findAllPayments(
    tenantId: string,
    query?: {
      status?: VendorPaymentStatus;
      partnerId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: any = { tenantId };

    if (query?.status) where.status = query.status;
    if (query?.partnerId) where.partnerId = query.partnerId;
    if (query?.startDate || query?.endDate) {
      where.tanggal = {};
      if (query.startDate) where.tanggal.gte = new Date(query.startDate);
      if (query.endDate) where.tanggal.lte = new Date(query.endDate);
    }

    return await this.prisma.vendorPayment.findMany({
      where,
      include: {
        partner: true,
        akunKasBank: true,
        journal: true,
        allocations: {
          include: {
            bill: true,
          },
        },
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  /**
   * Mengambil satu pembayaran berdasarkan ID
   */
  async getPaymentById(tenantId: string, id: string) {
    const payment = await this.prisma.vendorPayment.findUnique({
      where: { id },
      include: {
        partner: true,
        akunKasBank: true,
        journal: {
          include: {
            entries: {
              include: {
                chartOfAccount: true,
              },
            },
          },
        },
        voidJournal: true,
        allocations: {
          include: {
            bill: true,
          },
        },
      },
    });

    if (!payment || payment.tenantId !== tenantId) {
      throw new NotFoundException('Pembayaran vendor tidak ditemukan');
    }

    return payment;
  }
}
