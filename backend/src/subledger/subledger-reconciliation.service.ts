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

export interface CashBankAccountReconItem {
  id: string;
  kode: string;
  nama: string;
  jenis: string;
  mata_uang: string;
  chartOfAccount: {
    id: string;
    kode_akun: string;
    nama_akun: string;
  };
  glBalance: number;
  subledgerBalance: number;
  selisih: number;
  status: 'OK' | 'SELISIH';
  drillDown: {
    unlinkedEntries: any[];
    rawJournals: any[];
  };
}

export interface ReconciliationCashBankResult {
  controlType: 'CASH_BANK';
  status: 'OK' | 'SELISIH';
  totalGlBalance: number;
  totalSubledgerBalance: number;
  totalSelisih: number;
  selisih: number;
  accounts: CashBankAccountReconItem[];
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

export interface FixedAssetCategoryReconItem {
  id: string;
  kode: string;
  nama: string;
  perolehan: {
    accountId: string;
    kodeAkun: string;
    namaAkun: string;
    glBalance: number;
    subledgerBalance: number;
    selisih: number;
    status: 'OK' | 'SELISIH';
  };
  akumulasi: {
    accountId: string;
    kodeAkun: string;
    namaAkun: string;
    glBalance: number;
    subledgerBalance: number;
    selisih: number;
    status: 'OK' | 'SELISIH';
  };
  cip?: {
    accountId: string;
    kodeAkun: string;
    namaAkun: string;
    glBalance: number;
    subledgerBalance: number;
    selisih: number;
    status: 'OK' | 'SELISIH';
  } | null;
  status: 'OK' | 'SELISIH';
  totalSelisih: number;
}

export interface ReconciliationFixedAssetResult {
  controlType: 'FIXED_ASSET';
  status: 'OK' | 'SELISIH';
  totalGlPerolehan: number;
  totalSubledgerPerolehan: number;
  totalGlAkumulasi: number;
  totalSubledgerAkumulasi: number;
  totalGlCip: number;
  totalSubledgerCip: number;
  totalSelisih: number;
  selisih: number;
  categories: FixedAssetCategoryReconItem[];
  drillDown: {
    unpostedOrOrphanDocs: any[];
    rawOrUnlinkedJournals: any[];
    mismatchedAssets: any[];
    summary: {
      totalOrphanDocs: number;
      totalRawJournals: number;
      totalRawJournalValue: number;
      totalMismatchedAssets: number;
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
    cashBankEnabled?: boolean;
    fixedAssetEnabled?: boolean;
    blockPeriodCloseOnBankRecon?: boolean;
    blockPeriodCloseOnDepreciation?: boolean;
  };
  accounts: {
    ar: ReconciliationAccountResult;
    ap: ReconciliationAccountResult;
    inventory: ReconciliationAccountResult;
    grIrClearing: ReconciliationAccountResult;
    cashBank?: ReconciliationCashBankResult;
    fixedAsset?: ReconciliationFixedAssetResult;
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

    // 5. REKONSILIASI KAS & BANK (V4)
    let cashBankResult: ReconciliationCashBankResult | undefined;
    if (setting.cashBankEnabled) {
      cashBankResult = await this.reconcileCashBank(tenantId, endOfDay);
    }

    // 6. REKONSILIASI ASET TETAP (V4)
    let fixedAssetResult: ReconciliationFixedAssetResult | undefined;
    if (setting.fixedAssetEnabled) {
      fixedAssetResult = await this.reconcileFixedAsset(tenantId, endOfDay);
    }

    const totalSelisihAbsolut =
      Math.abs(arResult.selisih) +
      Math.abs(apResult.selisih) +
      Math.abs(invResult.selisih) +
      Math.abs(grIrResult.selisih) +
      (cashBankResult ? Math.abs(cashBankResult.totalSelisih) : 0) +
      (fixedAssetResult ? Math.abs(fixedAssetResult.totalSelisih) : 0);

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
        cashBankEnabled: setting.cashBankEnabled,
        fixedAssetEnabled: setting.fixedAssetEnabled,
        blockPeriodCloseOnBankRecon: setting.blockPeriodCloseOnBankRecon,
        blockPeriodCloseOnDepreciation: setting.blockPeriodCloseOnDepreciation,
      },
      accounts: {
        ar: arResult,
        ap: apResult,
        inventory: invResult,
        grIrClearing: grIrResult,
        cashBank: cashBankResult,
        fixedAsset: fixedAssetResult,
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

  // =========================================================================
  // 5. REKONSILIASI KAS & BANK (V4)
  // =========================================================================
  async reconcileCashBank(
    tenantId: string,
    endOfDay: Date,
  ): Promise<ReconciliationCashBankResult> {
    const cashBankAccounts = await this.prisma.cashBankAccount.findMany({
      where: { tenantId, isActive: true },
      include: { chartOfAccount: true },
      orderBy: { kode: 'asc' },
    });

    const accountItems: CashBankAccountReconItem[] = [];
    let totalGlBalance = 0;
    let totalSubledgerBalance = 0;
    const globalUnlinkedEntries: any[] = [];
    const globalRawJournals: any[] = [];

    for (const acc of cashBankAccounts) {
      // 1. Saldo GL Buku Besar
      const glEntries = await this.prisma.journalEntry.findMany({
        where: {
          chartOfAccountId: acc.chartOfAccountId,
          journal: {
            tenantId,
            status: { in: ['POSTED', 'APPROVED'] },
            tanggal: { lte: endOfDay },
          },
        },
        include: { journal: true },
      });

      let accGlBalance = 0;
      const linkedJournalIds = new Set<string>();

      // 2. Saldo Subledger CashBankEntry
      const cbEntries = await this.prisma.cashBankEntry.findMany({
        where: {
          cashBankAccountId: acc.id,
          tanggal: { lte: endOfDay },
        },
      });

      let accSubledgerBalance = 0;
      const itemUnlinkedEntries: any[] = [];

      for (const entry of cbEntries) {
        const amt = Number(entry.jumlahFungsional || entry.jumlah);
        if (entry.arah === 'MASUK') accSubledgerBalance += amt;
        else accSubledgerBalance -= amt;

        if (entry.journalId) {
          linkedJournalIds.add(entry.journalId);
        } else {
          const orphan = {
            cashBankEntryId: entry.id,
            tanggal: entry.tanggal,
            arah: entry.arah,
            sourceType: entry.sourceType,
            jumlah: amt,
            keterangan: entry.keterangan || 'Entri kas tidak tertaut dengan jurnal GL',
            rekening: `${acc.kode} - ${acc.nama}`,
          };
          itemUnlinkedEntries.push(orphan);
          globalUnlinkedEntries.push(orphan);
        }
      }

      // Periksa jurnal langsung ke akun CASH_BANK tanpa CashBankEntry
      const itemRawJournals: any[] = [];
      for (const e of glEntries) {
        const amt = Number(e.jumlah);
        if (e.tipe === 'DEBIT') accGlBalance += amt;
        else accGlBalance -= amt;

        if (!linkedJournalIds.has(e.journal.id)) {
          const rawJ = {
            journalId: e.journal.id,
            noVoucher: e.journal.no_voucher,
            tanggal: e.journal.tanggal,
            deskripsi: e.journal.deskripsi,
            sumberAplikasi: e.journal.sumber_aplikasi,
            tipe: e.tipe,
            jumlah: amt,
            rekening: `${acc.kode} - ${acc.nama}`,
            penyebab: 'Jurnal masuk ke akun kas/bank tanpa entri buku kas (gagal auto-capture atau direct posting)',
          };
          itemRawJournals.push(rawJ);
          globalRawJournals.push(rawJ);
        }
      }

      accGlBalance = Math.round(accGlBalance * 100) / 100;
      accSubledgerBalance = Math.round(accSubledgerBalance * 100) / 100;
      const accSelisih = Math.round((accGlBalance - accSubledgerBalance) * 100) / 100;
      const accOk = Math.abs(accSelisih) < 0.01;

      totalGlBalance += accGlBalance;
      totalSubledgerBalance += accSubledgerBalance;

      accountItems.push({
        id: acc.id,
        kode: acc.kode,
        nama: acc.nama,
        jenis: acc.jenis,
        mata_uang: acc.mata_uang,
        chartOfAccount: {
          id: acc.chartOfAccount?.id || acc.chartOfAccountId,
          kode_akun: acc.chartOfAccount?.kode_akun || '',
          nama_akun: acc.chartOfAccount?.nama_akun || '',
        },
        glBalance: accGlBalance,
        subledgerBalance: accSubledgerBalance,
        selisih: accSelisih,
        status: accOk ? 'OK' : 'SELISIH',
        drillDown: {
          unlinkedEntries: itemUnlinkedEntries,
          rawJournals: itemRawJournals,
        },
      });
    }

    totalGlBalance = Math.round(totalGlBalance * 100) / 100;
    totalSubledgerBalance = Math.round(totalSubledgerBalance * 100) / 100;
    const totalSelisih = Math.round((totalGlBalance - totalSubledgerBalance) * 100) / 100;
    const isOk = Math.abs(totalSelisih) < 0.01 && accountItems.every((a) => a.status === 'OK');

    return {
      controlType: 'CASH_BANK',
      status: isOk ? 'OK' : 'SELISIH',
      totalGlBalance,
      totalSubledgerBalance,
      totalSelisih,
      selisih: totalSelisih,
      accounts: accountItems,
      drillDown: {
        unpostedOrOrphanDocs: globalUnlinkedEntries,
        rawOrUnlinkedJournals: globalRawJournals,
        summary: {
          totalOrphanDocs: globalUnlinkedEntries.length,
          totalRawJournals: globalRawJournals.length,
          totalRawJournalValue: globalRawJournals.reduce((sum, j) => sum + j.jumlah, 0),
        },
      },
    };
  }

  // =========================================================================
  // 6. REKONSILIASI ASET TETAP (V4)
  // =========================================================================
  async reconcileFixedAsset(
    tenantId: string,
    endOfDay: Date,
  ): Promise<ReconciliationFixedAssetResult> {
    const categories = await this.prisma.assetCategory.findMany({
      where: { tenantId },
      include: {
        akunAset: true,
        akunAkumulasi: true,
        akunCip: true,
      },
      orderBy: { kode: 'asc' },
    });

    const categoryItems: FixedAssetCategoryReconItem[] = [];
    let totalGlPerolehan = 0;
    let totalSubledgerPerolehan = 0;
    let totalGlAkumulasi = 0;
    let totalSubledgerAkumulasi = 0;
    let totalGlCip = 0;
    let totalSubledgerCip = 0;

    const globalOrphanDocs: any[] = [];
    const globalRawJournals: any[] = [];
    const globalMismatchedAssets: any[] = [];

    for (const cat of categories) {
      // 1. HARGA PEROLEHAN
      let catGlPerolehan = 0;
      if (cat.akunAset) {
        const glEntries = await this.prisma.journalEntry.findMany({
          where: {
            chartOfAccountId: cat.akunAset.id,
            journal: {
              tenantId,
              status: { in: ['POSTED', 'APPROVED'] },
              tanggal: { lte: endOfDay },
            },
          },
          include: { journal: true },
        });
        for (const e of glEntries) {
          const amt = Number(e.jumlah);
          if (e.tipe === 'DEBIT') catGlPerolehan += amt;
          else catGlPerolehan -= amt;

          if (!e.journal.sourceDocType || !e.journal.sourceDocType.startsWith('ASSET')) {
            globalRawJournals.push({
              journalId: e.journal.id,
              noVoucher: e.journal.no_voucher,
              tanggal: e.journal.tanggal,
              deskripsi: e.journal.deskripsi,
              tipe: e.tipe,
              jumlah: amt,
              kategori: `${cat.kode} - ${cat.nama}`,
              akun: cat.akunAset.kode_akun,
              penyebab: 'Jurnal manual masuk langsung ke akun harga perolehan aset tanpa melalui subledger',
            });
          }
        }
      }

      // Hitung subledger perolehan: aset non-CIP yang diperoleh <= endOfDay dan belum dilepas <= endOfDay
      const assets = await this.prisma.fixedAsset.findMany({
        where: {
          tenantId,
          categoryId: cat.id,
          tanggalPerolehan: { lte: endOfDay },
          status: { in: ['AKTIF', 'DISUSUTKAN_PENUH', 'DIJUAL', 'DIHAPUSKAN'] },
        },
        include: {
          costAdditions: {
            where: { tanggal: { lte: endOfDay }, status: 'POSTED' },
          },
          disposals: {
            where: { tanggal: { lte: endOfDay }, status: 'POSTED' },
          },
          depreciationEntries: {
            where: {
              buku: 'KOMERSIAL',
              status: 'AKTIF',
              createdAt: { lte: endOfDay },
            },
          },
          impairments: {
            where: { tanggal: { lte: endOfDay }, status: 'POSTED' },
          },
        },
      });

      let catSubledgerPerolehan = 0;
      let catSubledgerAkumulasi = 0;

      for (const asset of assets) {
        const isDisposedOnOrBeforeEndOfDay = asset.disposals.length > 0;

        if (asset.status === 'CIP') {
          continue;
        }

        if (!isDisposedOnOrBeforeEndOfDay) {
          let assetPerolehan = Number(asset.hargaPerolehan);
          for (const addition of asset.costAdditions) {
            assetPerolehan += Number(addition.jumlah);
          }
          catSubledgerPerolehan += assetPerolehan;

          let assetAkumulasi = asset.depreciationEntries.reduce((sum, dep) => sum + Number(dep.jumlah), 0);
          for (const imp of asset.impairments) {
            assetAkumulasi += Number(imp.jumlah);
          }
          catSubledgerAkumulasi += assetAkumulasi;

          const recordedAkumulasi = Number(asset.akumulasiKomersial || 0);
          const calculatedAkumulasi = asset.depreciationEntries.reduce((sum, dep) => sum + Number(dep.jumlah), 0);
          if (Math.abs(recordedAkumulasi - calculatedAkumulasi) > 0.01) {
            globalMismatchedAssets.push({
              assetId: asset.id,
              noAset: asset.noAset,
              nama: asset.nama,
              kategori: cat.nama,
              akumulasiTercatat: recordedAkumulasi,
              totalEntriPenyusutan: calculatedAkumulasi,
              selisih: Math.round((recordedAkumulasi - calculatedAkumulasi) * 100) / 100,
              keterangan: 'Akumulasi pada kartu aset berbeda dengan jumlah entri penyusutan aktif',
            });
          }
        }
      }

      // 2. AKUMULASI PENYUSUTAN (GL - Normal KREDIT)
      let catGlAkumulasi = 0;
      if (cat.akunAkumulasi) {
        const glAccEntries = await this.prisma.journalEntry.findMany({
          where: {
            chartOfAccountId: cat.akunAkumulasi.id,
            journal: {
              tenantId,
              status: { in: ['POSTED', 'APPROVED'] },
              tanggal: { lte: endOfDay },
            },
          },
          include: { journal: true },
        });
        for (const e of glAccEntries) {
          const amt = Number(e.jumlah);
          if (e.tipe === 'KREDIT') catGlAkumulasi += amt;
          else catGlAkumulasi -= amt;

          if (!e.journal.sourceDocType || !e.journal.sourceDocType.startsWith('ASSET')) {
            globalRawJournals.push({
              journalId: e.journal.id,
              noVoucher: e.journal.no_voucher,
              tanggal: e.journal.tanggal,
              deskripsi: e.journal.deskripsi,
              tipe: e.tipe,
              jumlah: amt,
              kategori: `${cat.kode} - ${cat.nama}`,
              akun: cat.akunAkumulasi.kode_akun,
              penyebab: 'Jurnal manual masuk langsung ke akun akumulasi penyusutan tanpa melalui proses penyusutan',
            });
          }
        }
      }

      // 3. CIP (ASET DALAM PENYELESAIAN)
      let catGlCip = 0;
      let catSubledgerCip = 0;
      let cipRecon = null;

      if (cat.akunCip) {
        const glCipEntries = await this.prisma.journalEntry.findMany({
          where: {
            chartOfAccountId: cat.akunCip.id,
            journal: {
              tenantId,
              status: { in: ['POSTED', 'APPROVED'] },
              tanggal: { lte: endOfDay },
            },
          },
          include: { journal: true },
        });
        for (const e of glCipEntries) {
          const amt = Number(e.jumlah);
          if (e.tipe === 'DEBIT') catGlCip += amt;
          else catGlCip -= amt;
        }

        const cipAssets = await this.prisma.fixedAsset.findMany({
          where: {
            tenantId,
            categoryId: cat.id,
            status: 'CIP',
            tanggalPerolehan: { lte: endOfDay },
          },
        });
        catSubledgerCip = cipAssets.reduce((sum, a) => sum + Number(a.hargaPerolehan), 0);

        catGlCip = Math.round(catGlCip * 100) / 100;
        catSubledgerCip = Math.round(catSubledgerCip * 100) / 100;
        const cipSelisih = Math.round((catGlCip - catSubledgerCip) * 100) / 100;
        cipRecon = {
          accountId: cat.akunCip.id,
          kodeAkun: cat.akunCip.kode_akun,
          namaAkun: cat.akunCip.nama_akun,
          glBalance: catGlCip,
          subledgerBalance: catSubledgerCip,
          selisih: cipSelisih,
          status: (Math.abs(cipSelisih) < 0.01 ? 'OK' : 'SELISIH') as 'OK' | 'SELISIH',
        };
        totalGlCip += catGlCip;
        totalSubledgerCip += catSubledgerCip;
      }

      catGlPerolehan = Math.round(catGlPerolehan * 100) / 100;
      catSubledgerPerolehan = Math.round(catSubledgerPerolehan * 100) / 100;
      const selisihPerolehan = Math.round((catGlPerolehan - catSubledgerPerolehan) * 100) / 100;

      catGlAkumulasi = Math.round(catGlAkumulasi * 100) / 100;
      catSubledgerAkumulasi = Math.round(catSubledgerAkumulasi * 100) / 100;
      const selisihAkumulasi = Math.round((catGlAkumulasi - catSubledgerAkumulasi) * 100) / 100;

      totalGlPerolehan += catGlPerolehan;
      totalSubledgerPerolehan += catSubledgerPerolehan;
      totalGlAkumulasi += catGlAkumulasi;
      totalSubledgerAkumulasi += catSubledgerAkumulasi;

      const catTotalSelisih =
        Math.abs(selisihPerolehan) +
        Math.abs(selisihAkumulasi) +
        (cipRecon ? Math.abs(cipRecon.selisih) : 0);
      const catOk = catTotalSelisih < 0.01;

      categoryItems.push({
        id: cat.id,
        kode: cat.kode,
        nama: cat.nama,
        perolehan: {
          accountId: cat.akunAset?.id || '',
          kodeAkun: cat.akunAset?.kode_akun || '-',
          namaAkun: cat.akunAset?.nama_akun || '-',
          glBalance: catGlPerolehan,
          subledgerBalance: catSubledgerPerolehan,
          selisih: selisihPerolehan,
          status: Math.abs(selisihPerolehan) < 0.01 ? 'OK' : 'SELISIH',
        },
        akumulasi: {
          accountId: cat.akunAkumulasi?.id || '',
          kodeAkun: cat.akunAkumulasi?.kode_akun || '-',
          namaAkun: cat.akunAkumulasi?.nama_akun || '-',
          glBalance: catGlAkumulasi,
          subledgerBalance: catSubledgerAkumulasi,
          selisih: selisihAkumulasi,
          status: Math.abs(selisihAkumulasi) < 0.01 ? 'OK' : 'SELISIH',
        },
        cip: cipRecon,
        status: catOk ? 'OK' : 'SELISIH',
        totalSelisih: Math.round(catTotalSelisih * 100) / 100,
      });
    }

    const totalSelisih =
      Math.abs(totalGlPerolehan - totalSubledgerPerolehan) +
      Math.abs(totalGlAkumulasi - totalSubledgerAkumulasi) +
      Math.abs(totalGlCip - totalSubledgerCip);
    const isOk = totalSelisih < 0.01 && globalMismatchedAssets.length === 0;

    return {
      controlType: 'FIXED_ASSET',
      status: isOk ? 'OK' : 'SELISIH',
      totalGlPerolehan: Math.round(totalGlPerolehan * 100) / 100,
      totalSubledgerPerolehan: Math.round(totalSubledgerPerolehan * 100) / 100,
      totalGlAkumulasi: Math.round(totalGlAkumulasi * 100) / 100,
      totalSubledgerAkumulasi: Math.round(totalSubledgerAkumulasi * 100) / 100,
      totalGlCip: Math.round(totalGlCip * 100) / 100,
      totalSubledgerCip: Math.round(totalSubledgerCip * 100) / 100,
      totalSelisih: Math.round(totalSelisih * 100) / 100,
      selisih: Math.round(totalSelisih * 100) / 100,
      categories: categoryItems,
      drillDown: {
        unpostedOrOrphanDocs: globalOrphanDocs,
        rawOrUnlinkedJournals: globalRawJournals,
        mismatchedAssets: globalMismatchedAssets,
        summary: {
          totalOrphanDocs: globalOrphanDocs.length,
          totalRawJournals: globalRawJournals.length,
          totalRawJournalValue: globalRawJournals.reduce((sum, j) => sum + j.jumlah, 0),
          totalMismatchedAssets: globalMismatchedAssets.length,
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
   * Total piutang, hutang, persediaan, kas/bank, nilai tercatat aset, aset belum dilabel,
   * status rekonsiliasi bank terakhir, dan status penyusutan periode berjalan.
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

    // 4. Metrik Kas & Bank (V4)
    const totalKasBank = recon.accounts.cashBank?.totalSubledgerBalance || 0;
    const saldoPerRekening = recon.accounts.cashBank?.accounts.map((a) => ({
      id: a.id,
      kode: a.kode,
      nama: a.nama,
      jenis: a.jenis,
      mata_uang: a.mata_uang,
      saldo: a.subledgerBalance,
      status: a.status,
    })) || [];

    // Status Rekonsiliasi Bank Terakhir per Rekening BANK aktif
    const bankAccounts = await this.prisma.cashBankAccount.findMany({
      where: { tenantId, jenis: 'BANK', isActive: true },
      include: {
        bankReconciliations: {
          orderBy: { tanggalAkhir: 'desc' },
          take: 1,
        },
      },
    });
    const statusRekonsiliasiBank = bankAccounts.map((b) => ({
      cashBankAccountId: b.id,
      kodeRekening: b.kode,
      namaRekening: b.nama,
      statusTerakhir: b.bankReconciliations[0]?.status || 'BELUM_PERNAH',
      tanggalAkhir: b.bankReconciliations[0]?.tanggalAkhir ? b.bankReconciliations[0].tanggalAkhir.toISOString().slice(0, 10) : null,
      selisih: b.bankReconciliations[0]?.selisih ? Number(b.bankReconciliations[0].selisih) : 0,
    }));

    // 5. Metrik Aset Tetap (V4)
    const nilaiTercatatAset = Math.round(
      ((recon.accounts.fixedAsset?.totalSubledgerPerolehan || 0) -
       (recon.accounts.fixedAsset?.totalSubledgerAkumulasi || 0)) * 100
    ) / 100;

    const jumlahAsetBelumDilabel = await this.prisma.fixedAsset.count({
      where: {
        tenantId,
        statusLabel: 'BELUM_DILABEL',
        status: { in: ['DRAFT', 'AKTIF'] },
      },
    });

    // Status Proses Penyusutan Periode Berjalan
    const currentPeriod = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { tenantId },
        status: 'OPEN',
        tanggal_mulai: { lte: today },
        tanggal_selesai: { gte: today },
      },
    });

    let statusPenyusutanPeriodeBerjalan = 'TIDAK_ADA_PERIODE_AKTIF';
    if (currentPeriod) {
      const postedRun = await this.prisma.assetDepreciationRun.findFirst({
        where: {
          tenantId,
          periodId: currentPeriod.id,
          status: 'POSTED',
        },
      });
      statusPenyusutanPeriodeBerjalan = postedRun ? 'SUDAH_DIPOSTING' : 'BELUM_DIJALANKAN';
    }

    return {
      totalPiutang: recon.accounts.ar.subledgerBalance,
      totalHutang: recon.accounts.ap.subledgerBalance,
      nilaiPersediaan: recon.accounts.inventory.subledgerBalance,
      totalUnbilledGr: recon.accounts.grIrClearing.subledgerBalance,
      totalKasBank,
      saldoPerRekening,
      nilaiTercatatAset,
      jumlahAsetBelumDilabel,
      statusRekonsiliasiBank,
      statusPenyusutanPeriodeBerjalan,
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
        cashBank: recon.accounts.cashBank
          ? { status: recon.accounts.cashBank.status, selisih: recon.accounts.cashBank.totalSelisih }
          : undefined,
        fixedAsset: recon.accounts.fixedAsset
          ? { status: recon.accounts.fixedAsset.status, selisih: recon.accounts.fixedAsset.totalSelisih }
          : undefined,
      },
    };
  }
}
