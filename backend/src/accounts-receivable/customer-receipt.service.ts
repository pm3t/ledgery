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
  CreateCustomerReceiptDto,
  CreateReceiptAllocationDto,
} from './dto/customer-receipt.dto';
import {
  CustomerReceiptStatus,
  SalesInvoiceStatus,
  PostingSetupKey,
} from '@prisma/client';

@Injectable()
export class CustomerReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerPostingService: SubledgerPostingService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly accountingPeriodService: AccountingPeriodService,
  ) {}

  /**
   * Mengambil mapping akun dari PostingSetup
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
   * Membuat dan langsung memposting Penerimaan Pembayaran Pelanggan
   */
  async createAndPostReceipt(
    tenantId: string,
    dto: CreateCustomerReceiptDto,
    userName?: string,
  ) {
    // 1. Dukungan Idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.customerReceipt.findUnique({
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

    // 3. Validasi Partner
    const partner = await this.prisma.businessPartner.findUnique({
      where: { id: dto.partnerId },
    });
    if (!partner || partner.tenantId !== tenantId) {
      throw new NotFoundException('Pelanggan tidak ditemukan');
    }
    if (!partner.isActive) {
      throw new BadRequestException(`Pelanggan '${partner.nama}' sedang tidak aktif.`);
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
    const receiptKurs = dto.kurs || 1;
    const jumlah = Number(dto.jumlah);
    const jumlahFungsional = jumlah * receiptKurs;

    // 6. Ambil Akun Kontrol AR & FX dari PostingSetup
    const arControl = await this.getPostingAccount(tenantId, 'AR_CONTROL', partner.groupCode || undefined);
    const fxAccount = await this.getPostingAccount(tenantId, 'FX_GAIN_LOSS', partner.groupCode || undefined);

    if (!arControl) {
      throw new BadRequestException('Akun kontrol Piutang (AR_CONTROL) belum dipetakan di Posting Setup.');
    }

    // 7. Proses Alokasi Faktur
    let totalDialokasikan = 0;
    let totalSelisihKurs = 0; // Positif = Gain, Negatif = Loss
    const processedAllocations: any[] = [];
    const invoiceUpdates: any[] = [];

    if (dto.allocations && dto.allocations.length > 0) {
      for (const alloc of dto.allocations) {
        const alokasi = Number(alloc.jumlahAlokasi);
        if (alokasi <= 0) continue;

        if (alloc.invoiceId) {
          const inv = await this.prisma.salesInvoice.findUnique({
            where: { id: alloc.invoiceId },
          });

          if (!inv || inv.tenantId !== tenantId) {
            throw new NotFoundException(`Faktur ID '${alloc.invoiceId}' tidak ditemukan.`);
          }
          if (inv.partnerId !== dto.partnerId) {
            throw new BadRequestException(
              `Faktur '${inv.noDokumen}' bukan milik pelanggan '${partner.nama}'.`,
            );
          }
          if (inv.status !== SalesInvoiceStatus.POSTED && inv.status !== SalesInvoiceStatus.PARTIAL) {
            throw new BadRequestException(
              `Faktur '${inv.noDokumen}' tidak dapat dialokasikan (Status: ${inv.status}).`,
            );
          }
          if (alokasi > Number(inv.saldo) + 0.0001) {
            throw new BadRequestException(
              `Alokasi ${alokasi} melebihi sisa saldo faktur '${inv.noDokumen}' (Saldo: ${inv.saldo}).`,
            );
          }

          // Hitung Realized FX Gain/Loss
          const invKurs = Number(inv.kurs) || 1;
          const diffKurs = alokasi * (receiptKurs - invKurs);
          totalSelisihKurs += diffKurs;
          totalDialokasikan += alokasi;

          const newSaldo = Math.max(0, Number(inv.saldo) - alokasi);
          const newStatus =
            newSaldo <= 0.0001
              ? SalesInvoiceStatus.PAID
              : SalesInvoiceStatus.PARTIAL;

          invoiceUpdates.push({
            id: inv.id,
            newSaldo,
            newSaldoFungsional: newSaldo * invKurs,
            totalDialokasikanBaru: Number(inv.totalDialokasikan || 0) + alokasi,
            newStatus,
          });

          processedAllocations.push({
            invoiceId: inv.id,
            creditNoteId: null,
            jumlahAlokasi: alokasi,
            kursAlokasi: receiptKurs,
            selisihKurs: diffKurs,
          });
        }
      }
    }

    if (totalDialokasikan > jumlah + 0.0001) {
      throw new BadRequestException(
        `Total alokasi (${totalDialokasikan}) melebihi jumlah penerimaan kas (${jumlah}).`,
      );
    }

    const belumDialokasikan = Math.max(0, jumlah - totalDialokasikan);

    // 8. Generate No Dokumen
    const noDokumen = await this.documentNumberingService.generateNextNumber(
      tenantId,
      'AR_RECEIPT',
      'RCT',
    );

    // 9. Susun Entri Jurnal
    // Dr Kas/Bank = jumlah penerimaan
    // Cr Piutang = total alokasi (pada kurs historis invoice) + belum dialokasikan (pada kurs penerimaan)
    // Cr/Dr Laba/Rugi Selisih Kurs
    const entries: any[] = [];

    // Dr Kas / Bank
    entries.push({
      kode_akun: akunKasBank.kode_akun,
      tipe: 'DEBIT',
      jumlah,
    });

    // Cr Piutang Usaha
    if (totalSelisihKurs !== 0) {
      if (!fxAccount) {
        throw new BadRequestException(
          'Akun Selisih Kurs (FX_GAIN_LOSS) belum dipetakan di Posting Setup untuk mencatat selisih kurs realisasi.',
        );
      }

      if (totalSelisihKurs > 0) {
        // Gain (Laba Selisih Kurs) -> Cr FX_GAIN_LOSS
        entries.push({
          kode_akun: arControl.kode_akun,
          tipe: 'KREDIT',
          jumlah: jumlah - totalSelisihKurs,
        });
        entries.push({
          kode_akun: fxAccount.kode_akun,
          tipe: 'KREDIT',
          jumlah: totalSelisihKurs,
        });
      } else {
        // Loss (Rugi Selisih Kurs) -> Dr FX_GAIN_LOSS
        const rugi = Math.abs(totalSelisihKurs);
        entries.push({
          kode_akun: fxAccount.kode_akun,
          tipe: 'DEBIT',
          jumlah: rugi,
        });
        entries.push({
          kode_akun: arControl.kode_akun,
          tipe: 'KREDIT',
          jumlah: jumlah + rugi,
        });
      }
    } else {
      // Tidak ada selisih kurs
      entries.push({
        kode_akun: arControl.kode_akun,
        tipe: 'KREDIT',
        jumlah,
      });
    }

    // 10. Eksekusi Posting Jurnal GL
    const journal = await this.subledgerPostingService.postSubledgerJournal(
      tenantId,
      {
        tanggal: dto.tanggal,
        deskripsi: `Penerimaan Pembayaran ${noDokumen} - ${partner.nama}`,
        sumber_aplikasi: 'SUBLEDGER-AR',
        sourceDocType: 'CUSTOMER_RECEIPT',
        no_voucher: noDokumen,
        mata_uang: mataUang,
        entries,
      },
    );

    // 11. Simpan Transaksi & Update Faktur dalam Transaksi Database
    return await this.prisma.$transaction(async (tx) => {
      // Update saldo faktur-faktur yang dialokasikan
      for (const upd of invoiceUpdates) {
        await tx.salesInvoice.update({
          where: { id: upd.id },
          data: {
            saldo: upd.newSaldo,
            saldoFungsional: upd.newSaldoFungsional,
            totalDialokasikan: upd.totalDialokasikanBaru,
            status: upd.newStatus,
          },
        });
      }

      // Buat record CustomerReceipt
      return await tx.customerReceipt.create({
        data: {
          tenantId,
          noDokumen,
          tanggal: new Date(dto.tanggal),
          partnerId: dto.partnerId,
          akunKasBankId: dto.akunKasBankId,
          jumlah,
          jumlahFungsional,
          mata_uang: mataUang,
          kurs: receiptKurs,
          status: CustomerReceiptStatus.POSTED,
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
          partner: true,
          akunKasBank: true,
          allocations: {
            include: { invoice: true },
          },
          journal: true,
        },
      });
    });
  }

  /**
   * Membatalkan / Void Penerimaan Pembayaran
   */
  async voidReceipt(tenantId: string, id: string, alasan?: string) {
    const receipt = await this.prisma.customerReceipt.findUnique({
      where: { id },
      include: {
        allocations: {
          include: { invoice: true },
        },
      },
    });

    if (!receipt || receipt.tenantId !== tenantId) {
      throw new NotFoundException('Penerimaan pembayaran tidak ditemukan');
    }

    if (receipt.status === CustomerReceiptStatus.VOID) {
      throw new BadRequestException('Penerimaan pembayaran ini sudah berstatus VOID');
    }

    // 1. Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(),
    );

    // 2. Reverse Jurnal GL
    let voidJournalId: string | null = null;
    if (receipt.journalId) {
      const reversalJournal = await this.subledgerPostingService.reverseJournal(
        tenantId,
        receipt.journalId,
        new Date().toISOString().slice(0, 10),
        alasan || `Void Penerimaan Pembayaran ${receipt.noDokumen}`,
      );
      voidJournalId = reversalJournal.id;
    }

    // 3. Kembalikan Saldo Faktur
    return await this.prisma.$transaction(async (tx) => {
      for (const alloc of receipt.allocations) {
        if (alloc.invoice) {
          const inv = alloc.invoice;
          const restoredSaldo = Number(inv.saldo) + Number(alloc.jumlahAlokasi);
          const restoredDialokasi = Math.max(0, Number(inv.totalDialokasikan) - Number(alloc.jumlahAlokasi));
          const restoredStatus =
            restoredDialokasi <= 0.0001
              ? SalesInvoiceStatus.POSTED
              : SalesInvoiceStatus.PARTIAL;

          await tx.salesInvoice.update({
            where: { id: inv.id },
            data: {
              saldo: restoredSaldo,
              saldoFungsional: restoredSaldo * Number(inv.kurs),
              totalDialokasikan: restoredDialokasi,
              status: restoredStatus,
            },
          });
        }
      }

      return await tx.customerReceipt.update({
        where: { id },
        data: {
          status: CustomerReceiptStatus.VOID,
          voidJournalId,
          totalDialokasikan: 0,
          belumDialokasikan: 0,
        },
      });
    });
  }

  /**
   * Menampilkan semua penerimaan pembayaran
   */
  async findAll(
    tenantId: string,
    filters?: {
      partnerId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ) {
    const where: any = { tenantId };

    if (filters?.partnerId) where.partnerId = filters.partnerId;

    if (filters?.startDate || filters?.endDate) {
      where.tanggal = {};
      if (filters.startDate) where.tanggal.gte = new Date(filters.startDate);
      if (filters.endDate) where.tanggal.lte = new Date(filters.endDate);
    }

    if (filters?.search) {
      const s = filters.search;
      where.OR = [
        { noDokumen: { contains: s, mode: 'insensitive' } },
        { partner: { nama: { contains: s, mode: 'insensitive' } } },
      ];
    }

    return await this.prisma.customerReceipt.findMany({
      where,
      include: {
        partner: true,
        akunKasBank: true,
        allocations: {
          include: { invoice: true },
        },
        journal: true,
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  /**
   * Mengambil detail satu penerimaan
   */
  async findOne(tenantId: string, id: string) {
    const receipt = await this.prisma.customerReceipt.findUnique({
      where: { id },
      include: {
        partner: true,
        akunKasBank: true,
        allocations: {
          include: { invoice: true },
        },
        journal: true,
      },
    });

    if (!receipt || receipt.tenantId !== tenantId) {
      throw new NotFoundException('Penerimaan pembayaran tidak ditemukan');
    }

    return receipt;
  }
}
