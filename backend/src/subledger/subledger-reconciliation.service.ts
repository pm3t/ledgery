import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubledgerSettingService } from './subledger-setting.service';
import { PostingSetupKey } from '@prisma/client';

export interface ReconciliationAccountResult {
  controlType: 'AR' | 'AP' | 'INVENTORY' | 'GR_IR_CLEARING';
  account: {
    id: string;
    kode: string;
    nama: string;
  } | null;
  normalBalance: 'DEBIT' | 'KREDIT';
  glBalance: number;
  subledgerBalance: number;
  selisih: number;
  status: 'OK' | 'SELISIH';
  keterangan: string;
  drillDown: {
    unpostedOrOrphanDocs: any[];
    rawOrUnlinkedJournals: any[];
    summary: {
      totalOrphanDocs: number;
      totalRawJournals: number;
      totalRawJournalValue: number;
    };
  };
}

export interface SubledgerReconciliationSummary {
  tanggal: string;
  isFullyReconciled: boolean;
  totalSelisihAbsolut: number;
  setting: {
    arEnabled: boolean;
    apEnabled: boolean;
    inventoryEnabled: boolean;
    orderManagementEnabled: boolean;
    blockPeriodCloseOnRecon: boolean;
  };
  accounts: {
    ar: ReconciliationAccountResult;
    ap: ReconciliationAccountResult;
    inventory: ReconciliationAccountResult;
    grIrClearing: ReconciliationAccountResult;
  };
}

@Injectable()
export class SubledgerReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subledgerSettingService: SubledgerSettingService,
  ) {}

  /**
   * Menjalankan audit rekonsiliasi antara Buku Besar (GL) dan Sub Ledger
   * untuk akun kontrol AR, AP, INVENTORY, dan GR_IR_CLEARING pada tanggal tertentu.
   */
  async getReconciliation(
    tenantId: string,
    targetDate?: string,
  ): Promise<SubledgerReconciliationSummary> {
    const tanggalStr = targetDate || new Date().toISOString().slice(0, 10);
    const endOfDay = new Date(`${tanggalStr}T23:59:59.999Z`);

    const setting = await this.subledgerSettingService.getSettings(tenantId);
    const postingSetups = await this.subledgerSettingService.getPostingSetups(tenantId);

    // Ambil akun kontrol
    const arSetup = postingSetups.find((p) => p.key === PostingSetupKey.AR_CONTROL);
    const apSetup = postingSetups.find((p) => p.key === PostingSetupKey.AP_CONTROL);
    const invSetup = postingSetups.find((p) => p.key === PostingSetupKey.INVENTORY);
    const grIrSetup = postingSetups.find((p) => p.key === PostingSetupKey.GR_IR_CLEARING);

    // 1. REKONSILIASI AR (PIUTANG USAHA)
    const arResult = await this.reconcileAr(tenantId, arSetup?.account, endOfDay);

    // 2. REKONSILIASI AP (HUTANG USAHA)
    const apResult = await this.reconcileAp(tenantId, apSetup?.account, endOfDay);

    // 3. REKONSILIASI INVENTORY (PERSEDIAAN)
    const invResult = await this.reconcileInventory(tenantId, invSetup?.account, endOfDay);

    // 4. REKONSILIASI GR_IR_CLEARING (BARANG DITERIMA BELUM DITAGIH)
    const grIrResult = await this.reconcileGrIr(tenantId, grIrSetup?.account, endOfDay);

    const totalSelisihAbsolut =
      Math.abs(arResult.selisih) +
      Math.abs(apResult.selisih) +
      Math.abs(invResult.selisih) +
      Math.abs(grIrResult.selisih);

    const isFullyReconciled = totalSelisihAbsolut < 0.01;

    return {
      tanggal: tanggalStr,
      isFullyReconciled,
      totalSelisihAbsolut: Math.round(totalSelisihAbsolut * 100) / 100,
      setting: {
        arEnabled: setting.arEnabled,
        apEnabled: setting.apEnabled,
        inventoryEnabled: setting.inventoryEnabled,
        orderManagementEnabled: setting.orderManagementEnabled,
        blockPeriodCloseOnRecon: setting.blockPeriodCloseOnRecon,
      },
      accounts: {
        ar: arResult,
        ap: apResult,
        inventory: invResult,
        grIrClearing: grIrResult,
      },
    };
  }

  // =========================================================================
  // 1. REKONSILIASI AR
  // =========================================================================
  private async reconcileAr(
    tenantId: string,
    account: any,
    endOfDay: Date,
  ): Promise<ReconciliationAccountResult> {
    if (!account) {
      return this.createUnconfiguredResult('AR', 'DEBIT', 'Akun kontrol Piutang (AR_CONTROL) belum dipetakan di Posting Setup.');
    }

    // 1. Saldo GL Buku Besar
    const glEntries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: account.id,
        journal: {
          tenantId,
          status: { in: ['POSTED', 'APPROVED'] },
          tanggal: { lte: endOfDay },
        },
      },
      include: {
        journal: true,
      },
    });

    let glBalance = 0;
    const rawOrUnlinkedJournals: any[] = [];

    for (const e of glEntries) {
      const amt = Number(e.jumlah);
      if (e.tipe === 'DEBIT') glBalance += amt;
      else glBalance -= amt;

      const srcType = e.journal.sourceDocType;
      // Periksa apakah jurnal berasal dari subledger AR resmi
      const isSubledgerDoc = ['SALES_INVOICE', 'CREDIT_NOTE', 'CUSTOMER_RECEIPT'].includes(srcType || '');
      if (!isSubledgerDoc || !e.journal.sourceDocId) {
        rawOrUnlinkedJournals.push({
          journalId: e.journal.id,
          noVoucher: e.journal.no_voucher,
          tanggal: e.journal.tanggal,
          deskripsi: e.journal.deskripsi,
          sumberAplikasi: e.journal.sumber_aplikasi,
          tipe: e.tipe,
          jumlah: amt,
          penyebab: !srcType
            ? 'Jurnal manual masuk langsung ke akun kontrol sebelum akun dikunci / direct posting aktif'
            : `Sumber jurnal bukan dokumen AR (${srcType})`,
        });
      }
    }

    // 2. Saldo Subledger AR
    // Faktur Penjualan berstatus POSTED/PARTIAL/PAID yang diposting sebelum endOfDay
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        tenantId,
        status: { in: ['POSTED', 'PARTIAL', 'PAID'] },
        tanggal: { lte: endOfDay },
      },
      include: {
        allocations: {
          where: { tanggalAlokasi: { lte: endOfDay } },
        },
      },
    });

    const unpostedOrOrphanDocs: any[] = [];
    let totalSubledgerAr = 0;

    for (const inv of invoices) {
      if (!inv.journalId) {
        unpostedOrOrphanDocs.push({
          dokumenId: inv.id,
          noDokumen: inv.noDokumen,
          tipe: 'SALES_INVOICE',
          tanggal: inv.tanggal,
          total: Number(inv.totalFungsional),
          keterangan: 'Faktur Penjualan tidak memiliki tautan jurnal GL',
        });
      }

      const totalFungsional = Number(inv.totalFungsional || inv.total);
      const allocatedAsOfDate = inv.allocations.reduce(
        (sum, a) => sum + Number(a.jumlahAlokasi) * Number(a.kursAlokasi || 1),
        0,
      );
      const sisaPiutang = Math.max(0, totalFungsional - allocatedAsOfDate);
      totalSubledgerAr += sisaPiutang;
    }

    // Kurangi Nota Kredit berstatus POSTED yang belum teralokasi penuh
    const creditNotes = await this.prisma.creditNote.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        tanggal: { lte: endOfDay },
      },
    });
    for (const cn of creditNotes) {
      totalSubledgerAr -= Number(cn.saldoFungsional || cn.saldo);
    }

    // Kurangi Uang Muka Penerimaan yang belum dialokasikan
    const receipts = await this.prisma.customerReceipt.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        tanggal: { lte: endOfDay },
      },
    });
    for (const rc of receipts) {
      totalSubledgerAr -= Number(rc.belumDialokasikan || 0) * Number(rc.kurs || 1);
    }

    glBalance = Math.round(glBalance * 100) / 100;
    totalSubledgerAr = Math.round(totalSubledgerAr * 100) / 100;
    const selisih = Math.round((glBalance - totalSubledgerAr) * 100) / 100;
    const isOk = Math.abs(selisih) < 0.01;

    return {
      controlType: 'AR',
      account: { id: account.id, kode: account.kode_akun, nama: account.nama_akun },
      normalBalance: 'DEBIT',
      glBalance,
      subledgerBalance: totalSubledgerAr,
      selisih,
      status: isOk ? 'OK' : 'SELISIH',
      keterangan: isOk
        ? 'Saldo Buku Besar Akun Piutang cocok sempurna dengan buku pembantu Piutang (Sub Ledger AR).'
        : `Ditemukan selisih Rp ${Math.abs(selisih).toLocaleString('id-ID')} antara GL dan Sub Ledger AR.`,
      drillDown: {
        unpostedOrOrphanDocs,
        rawOrUnlinkedJournals,
        summary: {
          totalOrphanDocs: unpostedOrOrphanDocs.length,
          totalRawJournals: rawOrUnlinkedJournals.length,
          totalRawJournalValue: rawOrUnlinkedJournals.reduce((s, j) => s + (j.tipe === 'DEBIT' ? j.jumlah : -j.jumlah), 0),
        },
      },
    };
  }

  // =========================================================================
  // 2. REKONSILIASI AP
  // =========================================================================
  private async reconcileAp(
    tenantId: string,
    account: any,
    endOfDay: Date,
  ): Promise<ReconciliationAccountResult> {
    if (!account) {
      return this.createUnconfiguredResult('AP', 'KREDIT', 'Akun kontrol Hutang (AP_CONTROL) belum dipetakan di Posting Setup.');
    }

    // 1. Saldo GL Buku Besar (Kredit - Debit)
    const glEntries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: account.id,
        journal: {
          tenantId,
          status: { in: ['POSTED', 'APPROVED'] },
          tanggal: { lte: endOfDay },
        },
      },
      include: {
        journal: true,
      },
    });

    let glBalance = 0;
    const rawOrUnlinkedJournals: any[] = [];

    for (const e of glEntries) {
      const amt = Number(e.jumlah);
      if (e.tipe === 'KREDIT') glBalance += amt;
      else glBalance -= amt;

      const srcType = e.journal.sourceDocType;
      const isSubledgerDoc = ['PURCHASE_BILL', 'DEBIT_NOTE', 'VENDOR_PAYMENT'].includes(srcType || '');
      if (!isSubledgerDoc || !e.journal.sourceDocId) {
        rawOrUnlinkedJournals.push({
          journalId: e.journal.id,
          noVoucher: e.journal.no_voucher,
          tanggal: e.journal.tanggal,
          deskripsi: e.journal.deskripsi,
          sumberAplikasi: e.journal.sumber_aplikasi,
          tipe: e.tipe,
          jumlah: amt,
          penyebab: !srcType
            ? 'Jurnal manual masuk langsung ke akun kontrol sebelum akun dikunci / direct posting aktif'
            : `Sumber jurnal bukan dokumen AP (${srcType})`,
        });
      }
    }

    // 2. Saldo Subledger AP
    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: { in: ['POSTED', 'PARTIAL', 'PAID'] },
        tanggal: { lte: endOfDay },
      },
      include: {
        allocations: {
          where: { tanggalAlokasi: { lte: endOfDay } },
        },
      },
    });

    const unpostedOrOrphanDocs: any[] = [];
    let totalSubledgerAp = 0;

    for (const b of bills) {
      if (!b.journalId) {
        unpostedOrOrphanDocs.push({
          dokumenId: b.id,
          noDokumen: b.noDokumen,
          tipe: 'PURCHASE_BILL',
          tanggal: b.tanggal,
          total: Number(b.totalFungsional),
          keterangan: 'Faktur Pembelian tidak memiliki tautan jurnal GL',
        });
      }

      const totalFungsional = Number(b.totalFungsional || b.total);
      const allocatedAsOfDate = b.allocations.reduce(
        (sum, a) => sum + Number(a.jumlahAlokasi) * Number(a.kursAlokasi || 1),
        0,
      );
      const sisaHutang = Math.max(0, totalFungsional - allocatedAsOfDate);
      totalSubledgerAp += sisaHutang;
    }

    // Kurangi Nota Debit berstatus POSTED yang belum teralokasi penuh
    const debitNotes = await this.prisma.debitNote.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        tanggal: { lte: endOfDay },
      },
    });
    for (const dn of debitNotes) {
      totalSubledgerAp -= Number(dn.saldoFungsional || dn.saldo);
    }

    // Kurangi Uang Muka Vendor yang belum dialokasikan
    const payments = await this.prisma.vendorPayment.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        tanggal: { lte: endOfDay },
      },
    });
    for (const vp of payments) {
      totalSubledgerAp -= Number(vp.belumDialokasikan || 0) * Number(vp.kurs || 1);
    }

    glBalance = Math.round(glBalance * 100) / 100;
    totalSubledgerAp = Math.round(totalSubledgerAp * 100) / 100;
    const selisih = Math.round((glBalance - totalSubledgerAp) * 100) / 100;
    const isOk = Math.abs(selisih) < 0.01;

    return {
      controlType: 'AP',
      account: { id: account.id, kode: account.kode_akun, nama: account.nama_akun },
      normalBalance: 'KREDIT',
      glBalance,
      subledgerBalance: totalSubledgerAp,
      selisih,
      status: isOk ? 'OK' : 'SELISIH',
      keterangan: isOk
        ? 'Saldo Buku Besar Akun Hutang cocok sempurna dengan buku pembantu Hutang (Sub Ledger AP).'
        : `Ditemukan selisih Rp ${Math.abs(selisih).toLocaleString('id-ID')} antara GL dan Sub Ledger AP.`,
      drillDown: {
        unpostedOrOrphanDocs,
        rawOrUnlinkedJournals,
        summary: {
          totalOrphanDocs: unpostedOrOrphanDocs.length,
          totalRawJournals: rawOrUnlinkedJournals.length,
          totalRawJournalValue: rawOrUnlinkedJournals.reduce((s, j) => s + (j.tipe === 'KREDIT' ? j.jumlah : -j.jumlah), 0),
        },
      },
    };
  }

  // =========================================================================
  // 3. REKONSILIASI INVENTORY
  // =========================================================================
  private async reconcileInventory(
    tenantId: string,
    account: any,
    endOfDay: Date,
  ): Promise<ReconciliationAccountResult> {
    if (!account) {
      return this.createUnconfiguredResult('INVENTORY', 'DEBIT', 'Akun kontrol Persediaan (INVENTORY) belum dipetakan di Posting Setup.');
    }

    // 1. Saldo GL Buku Besar (Debit - Kredit)
    const glEntries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: account.id,
        journal: {
          tenantId,
          status: { in: ['POSTED', 'APPROVED'] },
          tanggal: { lte: endOfDay },
        },
      },
      include: {
        journal: true,
      },
    });

    let glBalance = 0;
    const rawOrUnlinkedJournals: any[] = [];

    for (const e of glEntries) {
      const amt = Number(e.jumlah);
      if (e.tipe === 'DEBIT') glBalance += amt;
      else glBalance -= amt;

      const srcType = e.journal.sourceDocType;
      const isSubledgerDoc = [
        'STOCK_MOVEMENT',
        'GOODS_RECEIPT',
        'DELIVERY_ORDER',
        'STOCK_ADJUSTMENT',
        'STOCK_RECEIPT_OTHER',
        'STOCK_TRANSFER',
        'OPENING_BALANCE',
      ].includes(srcType || '');

      if (!isSubledgerDoc || !e.journal.sourceDocId) {
        rawOrUnlinkedJournals.push({
          journalId: e.journal.id,
          noVoucher: e.journal.no_voucher,
          tanggal: e.journal.tanggal,
          deskripsi: e.journal.deskripsi,
          sumberAplikasi: e.journal.sumber_aplikasi,
          tipe: e.tipe,
          jumlah: amt,
          penyebab: !srcType
            ? 'Jurnal manual masuk langsung ke akun persediaan sebelum akun dikunci / direct posting aktif'
            : `Sumber jurnal bukan transaksi persediaan (${srcType})`,
        });
      }
    }

    // 2. Saldo Subledger Persediaan (Akumulasi mutasi stok sampai dengan tanggal)
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        tanggal: { lte: endOfDay },
      },
    });

    let totalSubledgerInv = 0;
    const unpostedOrOrphanDocs: any[] = [];

    for (const m of movements) {
      const nilai = Number(m.nilai);
      totalSubledgerInv += nilai;

      if (!m.journalId && m.tipe !== 'TRANSFER_IN' && m.tipe !== 'TRANSFER_OUT') {
        // Transfer antar gudang di tenant yang sama tidak selalu menghasilkan jurnal finansial
        unpostedOrOrphanDocs.push({
          dokumenId: m.id,
          noDokumen: `${m.tipe} (Item: ${m.itemId})`,
          tipe: 'STOCK_MOVEMENT',
          tanggal: m.tanggal,
          total: nilai,
          keterangan: 'Pergerakan stok tidak tertaut ke jurnal finansial',
        });
      }
    }

    glBalance = Math.round(glBalance * 100) / 100;
    totalSubledgerInv = Math.round(totalSubledgerInv * 100) / 100;
    const selisih = Math.round((glBalance - totalSubledgerInv) * 100) / 100;
    const isOk = Math.abs(selisih) < 0.01;

    return {
      controlType: 'INVENTORY',
      account: { id: account.id, kode: account.kode_akun, nama: account.nama_akun },
      normalBalance: 'DEBIT',
      glBalance,
      subledgerBalance: totalSubledgerInv,
      selisih,
      status: isOk ? 'OK' : 'SELISIH',
      keterangan: isOk
        ? 'Saldo Buku Besar Akun Persediaan cocok sempurna dengan nilai total mutasi fisik stok (Sub Ledger Inventory).'
        : `Ditemukan selisih Rp ${Math.abs(selisih).toLocaleString('id-ID')} antara GL dan Sub Ledger Persediaan.`,
      drillDown: {
        unpostedOrOrphanDocs,
        rawOrUnlinkedJournals,
        summary: {
          totalOrphanDocs: unpostedOrOrphanDocs.length,
          totalRawJournals: rawOrUnlinkedJournals.length,
          totalRawJournalValue: rawOrUnlinkedJournals.reduce((s, j) => s + (j.tipe === 'DEBIT' ? j.jumlah : -j.jumlah), 0),
        },
      },
    };
  }

  // =========================================================================
  // 4. REKONSILIASI GR_IR_CLEARING
  // =========================================================================
  private async reconcileGrIr(
    tenantId: string,
    account: any,
    endOfDay: Date,
  ): Promise<ReconciliationAccountResult> {
    if (!account) {
      return this.createUnconfiguredResult('GR_IR_CLEARING', 'KREDIT', 'Akun kliring GR/IR (GR_IR_CLEARING) belum dipetakan di Posting Setup.');
    }

    // 1. Saldo GL Buku Besar (Kredit - Debit)
    const glEntries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: account.id,
        journal: {
          tenantId,
          status: { in: ['POSTED', 'APPROVED'] },
          tanggal: { lte: endOfDay },
        },
      },
      include: {
        journal: true,
      },
    });

    let glBalance = 0;
    const rawOrUnlinkedJournals: any[] = [];

    for (const e of glEntries) {
      const amt = Number(e.jumlah);
      if (e.tipe === 'KREDIT') glBalance += amt;
      else glBalance -= amt;

      const srcType = e.journal.sourceDocType;
      const isSubledgerDoc = ['GOODS_RECEIPT', 'PURCHASE_BILL'].includes(srcType || '');
      if (!isSubledgerDoc || !e.journal.sourceDocId) {
        rawOrUnlinkedJournals.push({
          journalId: e.journal.id,
          noVoucher: e.journal.no_voucher,
          tanggal: e.journal.tanggal,
          deskripsi: e.journal.deskripsi,
          sumberAplikasi: e.journal.sumber_aplikasi,
          tipe: e.tipe,
          jumlah: amt,
          penyebab: !srcType
            ? 'Jurnal manual masuk langsung ke akun kliring GR/IR'
            : `Sumber jurnal bukan GR atau Bill (${srcType})`,
        });
      }
    }

    // 2. Saldo Subledger GR/IR: Total sisa nilai barang diterima belum ditagih
    const unbilledGrLines = await this.prisma.goodsReceiptLine.findMany({
      where: {
        receipt: {
          tenantId,
          status: 'POSTED',
          tanggal: { lte: endOfDay },
        },
      },
      include: {
        receipt: { include: { partner: true, warehouse: true } },
        item: true,
      },
    });

    let totalSubledgerGrIr = 0;
    const unpostedOrOrphanDocs: any[] = [];

    for (const l of unbilledGrLines) {
      const qtyDiterima = Number(l.qty);
      const qtyDitagih = Number(l.qtyDitagih);
      const sisaQty = Math.max(0, qtyDiterima - qtyDitagih);

      if (sisaQty > 0) {
        const biayaSatuan = Number(l.biayaSatuan);
        const nilaiBelumDitagih = Math.round(sisaQty * biayaSatuan * 100) / 100;
        totalSubledgerGrIr += nilaiBelumDitagih;

        unpostedOrOrphanDocs.push({
          dokumenId: l.receipt?.id || l.id,
          noDokumen: l.receipt?.noDokumen || '-',
          tipe: 'GOODS_RECEIPT_LINE',
          tanggal: l.receipt?.tanggal || new Date(),
          vendor: l.receipt?.partner?.nama || '-',
          item: l.item ? `${l.item.kode} - ${l.item.nama}` : '-',
          sisaQty,
          biayaSatuan,
          total: nilaiBelumDitagih,
          keterangan: `Penerimaan barang belum ditagih (${sisaQty} unit)`,
        });
      }
    }

    glBalance = Math.round(glBalance * 100) / 100;
    totalSubledgerGrIr = Math.round(totalSubledgerGrIr * 100) / 100;
    const selisih = Math.round((glBalance - totalSubledgerGrIr) * 100) / 100;
    const isOk = Math.abs(selisih) < 0.01;

    return {
      controlType: 'GR_IR_CLEARING',
      account: { id: account.id, kode: account.kode_akun, nama: account.nama_akun },
      normalBalance: 'KREDIT',
      glBalance,
      subledgerBalance: totalSubledgerGrIr,
      selisih,
      status: isOk ? 'OK' : 'SELISIH',
      keterangan: isOk
        ? 'Saldo akun kliring GR/IR di Buku Besar cocok sempurna dengan rincian penerimaan barang belum ditagih.'
        : `Ditemukan selisih Rp ${Math.abs(selisih).toLocaleString('id-ID')} antara GL dan penerimaan belum ditagih.`,
      drillDown: {
        unpostedOrOrphanDocs,
        rawOrUnlinkedJournals,
        summary: {
          totalOrphanDocs: unpostedOrOrphanDocs.length,
          totalRawJournals: rawOrUnlinkedJournals.length,
          totalRawJournalValue: rawOrUnlinkedJournals.reduce((s, j) => s + (j.tipe === 'KREDIT' ? j.jumlah : -j.jumlah), 0),
        },
      },
    };
  }

  private createUnconfiguredResult(
    controlType: any,
    normalBalance: 'DEBIT' | 'KREDIT',
    keterangan: string,
  ): ReconciliationAccountResult {
    return {
      controlType,
      account: null,
      normalBalance,
      glBalance: 0,
      subledgerBalance: 0,
      selisih: 0,
      status: 'OK',
      keterangan,
      drillDown: {
        unpostedOrOrphanDocs: [],
        rawOrUnlinkedJournals: [],
        summary: { totalOrphanDocs: 0, totalRawJournals: 0, totalRawJournalValue: 0 },
      },
    };
  }

  /**
   * Mengambil ringkasan metrik lintas modul untuk Dashboard Staf Akuntansi:
   * Total piutang, total hutang, nilai persediaan, faktur jatuh tempo, PO/SO terbuka, dan status rekonsiliasi.
   */
  async getDashboardSummary(tenantId: string) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // 1. Rekonsiliasi Status
    const recon = await this.getReconciliation(tenantId, todayStr);

    // 2. Faktur Jatuh Tempo
    const overdueInvoices = await this.prisma.salesInvoice.count({
      where: {
        tenantId,
        status: { in: ['POSTED', 'PARTIAL'] },
        saldo: { gt: 0 },
        jatuhTempo: { lt: today },
      },
    });

    const overdueBills = await this.prisma.purchaseBill.count({
      where: {
        tenantId,
        status: { in: ['POSTED', 'PARTIAL'] },
        saldo: { gt: 0 },
        jatuhTempo: { lt: today },
      },
    });

    // 3. PO / SO Terbuka
    const openPoCount = await this.prisma.purchaseOrder.count({
      where: {
        tenantId,
        status: { in: ['OPEN', 'PARTIAL'] },
      },
    });

    const openSoCount = await this.prisma.salesOrder.count({
      where: {
        tenantId,
        status: { in: ['OPEN', 'PARTIAL'] },
      },
    });

    return {
      totalPiutang: recon.accounts.ar.subledgerBalance,
      totalHutang: recon.accounts.ap.subledgerBalance,
      nilaiPersediaan: recon.accounts.inventory.subledgerBalance,
      totalUnbilledGr: recon.accounts.grIrClearing.subledgerBalance,
      jumlahFakturJatuhTempo: overdueInvoices + overdueBills,
      detailJatuhTempo: {
        piutangJatuhTempo: overdueInvoices,
        hutangJatuhTempo: overdueBills,
      },
      jumlahPoTerbuka: openPoCount,
      jumlahSoTerbuka: openSoCount,
      statusRekonsiliasi: recon.isFullyReconciled ? 'OK' : 'SELISIH',
      totalSelisihAbsolut: recon.totalSelisihAbsolut,
      accounts: {
        ar: { status: recon.accounts.ar.status, selisih: recon.accounts.ar.selisih },
        ap: { status: recon.accounts.ap.status, selisih: recon.accounts.ap.selisih },
        inventory: { status: recon.accounts.inventory.status, selisih: recon.accounts.inventory.selisih },
        grIrClearing: { status: recon.accounts.grIrClearing.status, selisih: recon.accounts.grIrClearing.selisih },
      },
    };
  }
}
