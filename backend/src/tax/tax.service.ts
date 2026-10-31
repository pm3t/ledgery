import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JenisPajak, KategoriAkun } from '@prisma/client';

@Injectable()
export class TaxService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // PENGATURAN PAJAK
  // ==========================================

  async getTaxSetting(tenantId: string) {
    let setting = await this.prisma.taxSetting.findUnique({
      where: { tenantId },
    });
    if (!setting) {
      setting = await this.prisma.taxSetting.create({
        data: { tenantId },
      });
    }
    return setting;
  }

  async updateTaxSetting(tenantId: string, tarif_ppn: number, npwp: string | null, aktifkan_pph21: boolean) {
    return this.prisma.taxSetting.upsert({
      where: { tenantId },
      create: { tenantId, tarif_ppn, npwp, aktifkan_pph21 },
      update: { tarif_ppn, npwp, aktifkan_pph21 },
    });
  }

  // ==========================================
  // KALKULASI PPN
  // ==========================================

  /**
   * PERHATIAN: Modul ini adalah REKAP dasar untuk kebutuhan internal (estimasi), 
   * BUKAN integrasi resmi ke sistem DJP/Coretax.
   * Mendukung sumber dari dokumen Sub Ledger (Faktur Penjualan/Pembelian berstatus POSTED)
   * maupun fallback mekanisme jurnal lama bila tenant belum mengaktifkan sub ledger.
   */
  async calculatePPN(tenantId: string, periode: string) {
    // periode format: "YYYY-MM"
    const setting = await this.getTaxSetting(tenantId);
    const tarif = setting.tarif_ppn / 100; // default 0.11 (11%)

    const startDate = new Date(`${periode}-01T00:00:00Z`);
    const endOfMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    const endDate = new Date(`${endOfMonth.toISOString().split('T')[0]}T23:59:59Z`);

    // Periksa apakah tenant mengaktifkan sub ledger (AR atau AP)
    const subledgerSetting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });
    const hasSubledger =
      subledgerSetting && (subledgerSetting.arEnabled || subledgerSetting.apEnabled);

    if (hasSubledger) {
      // 1. PPN KELUARAN (DARI SALES INVOICE & CREDIT NOTE POSTED)
      const salesInvoices = await this.prisma.salesInvoice.findMany({
        where: {
          tenantId,
          status: { in: ['POSTED', 'PARTIAL', 'PAID'] },
          tanggal: { gte: startDate, lte: endDate },
        },
        include: { partner: true },
      });

      const creditNotes = await this.prisma.creditNote.findMany({
        where: {
          tenantId,
          status: 'POSTED',
          tanggal: { gte: startDate, lte: endDate },
        },
      });

      let dppKeluaran = 0;
      let totalPpnKeluaran = 0;
      const dokumenKeluaran: any[] = [];

      for (const inv of salesInvoices) {
        const dpp = Math.max(0, Number(inv.subtotalFungsional || inv.subtotal || 0) - Number(inv.totalDiskonFungsional || inv.totalDiskon || 0));
        const ppn = Number(inv.totalPpnFungsional || inv.totalPpn || 0);
        dppKeluaran += dpp;
        totalPpnKeluaran += ppn;

        dokumenKeluaran.push({
          id: inv.id,
          noDokumen: inv.noDokumen,
          tipe: 'FAKTUR_PENJUALAN',
          tanggal: inv.tanggal,
          pelanggan: inv.partner?.nama,
          dpp,
          ppn,
        });
      }

      for (const cn of creditNotes) {
        const dpp = Math.max(0, Number(cn.subtotalFungsional || cn.subtotal || 0) - Number(cn.totalDiskonFungsional || cn.totalDiskon || 0));
        const ppn = Number(cn.totalPpnFungsional || cn.totalPpn || 0);
        dppKeluaran -= dpp;
        totalPpnKeluaran -= ppn;

        dokumenKeluaran.push({
          id: cn.id,
          noDokumen: cn.noDokumen,
          tipe: 'RETUR_NOTA_KREDIT',
          tanggal: cn.tanggal,
          dpp: -dpp,
          ppn: -ppn,
        });
      }

      // 2. PPN MASUKAN (DARI PURCHASE BILL & DEBIT NOTE POSTED)
      const purchaseBills = await this.prisma.purchaseBill.findMany({
        where: {
          tenantId,
          status: { in: ['POSTED', 'PARTIAL', 'PAID'] },
          tanggal: { gte: startDate, lte: endDate },
        },
        include: { partner: true },
      });

      const debitNotes = await this.prisma.debitNote.findMany({
        where: {
          tenantId,
          status: 'POSTED',
          tanggal: { gte: startDate, lte: endDate },
        },
      });

      let dppMasukan = 0;
      let totalPpnMasukan = 0;
      const dokumenMasukan: any[] = [];

      for (const bill of purchaseBills) {
        const dpp = Math.max(0, Number(bill.subtotalFungsional || bill.subtotal || 0) - Number(bill.totalDiskonFungsional || bill.totalDiskon || (bill as any).diskon || 0));
        const ppn = Number(bill.totalPpnFungsional || bill.totalPpn || (bill as any).ppnMasukan || 0);
        dppMasukan += dpp;
        totalPpnMasukan += ppn;

        dokumenMasukan.push({
          id: bill.id,
          noDokumen: bill.noDokumen,
          noFakturVendor: bill.noFakturVendor,
          nomorFakturPajakMasukan: bill.nomorFakturPajakMasukan,
          tipe: 'FAKTUR_PEMBELIAN',
          tanggal: bill.tanggal,
          vendor: bill.partner?.nama,
          dpp,
          ppn,
        });
      }

      for (const dn of debitNotes) {
        const dpp = Math.max(0, Number(dn.subtotalFungsional || dn.subtotal || 0) - Number(dn.totalDiskonFungsional || dn.totalDiskon || 0));
        const ppn = Number(dn.totalPpnFungsional || dn.totalPpn || 0);
        dppMasukan -= dpp;
        totalPpnMasukan -= ppn;

        dokumenMasukan.push({
          id: dn.id,
          noDokumen: dn.noDokumen,
          tipe: 'RETUR_NOTA_DEBIT',
          tanggal: dn.tanggal,
          dpp: -dpp,
          ppn: -ppn,
        });
      }

      dppKeluaran = Math.round(Math.max(0, dppKeluaran) * 100) / 100;
      totalPpnKeluaran = Math.round(Math.max(0, totalPpnKeluaran) * 100) / 100;
      dppMasukan = Math.round(Math.max(0, dppMasukan) * 100) / 100;
      totalPpnMasukan = Math.round(Math.max(0, totalPpnMasukan) * 100) / 100;

      const ppnKurangLebihBayar = Math.round((totalPpnKeluaran - totalPpnMasukan) * 100) / 100;

      // Simpan ke TaxRecap (DPP = dppKeluaran, Total Pajak = Net PPN Kurang/Lebih Bayar)
      const recap = await this.prisma.taxRecap.create({
        data: {
          tenantId,
          jenis_pajak: JenisPajak.PPN,
          periode,
          total_dasar_pengenaan: dppKeluaran,
          total_pajak: ppnKurangLebihBayar,
        },
      });

      return {
        ...recap,
        metodeSumber: 'SUBLEDGER_DOCUMENTS',
        ppnKeluaran: {
          totalDpp: dppKeluaran,
          totalPpn: totalPpnKeluaran,
          jumlahDokumen: dokumenKeluaran.length,
          dokumen: dokumenKeluaran,
        },
        ppnMasukan: {
          totalDpp: dppMasukan,
          totalPpn: totalPpnMasukan,
          jumlahDokumen: dokumenMasukan.length,
          dokumen: dokumenMasukan,
        },
        ppnKurangLebihBayar,
        posisiPajak: ppnKurangLebihBayar >= 0 ? 'KURANG_BAYAR' : 'LEBIH_BAYAR',
      };
    }

    // Fallback: Mekanisme lama jurnal untuk tenant tanpa sub ledger
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        journal: {
          tenantId,
          status: { in: ['POSTED', 'APPROVED'] },
          tanggal: {
            gte: startDate,
            lte: endDate,
          },
        },
        chartOfAccount: {
          kategori: KategoriAkun.PENDAPATAN,
        },
      },
    });

    let totalDasarPengenaan = 0;
    entries.forEach((e) => {
      if (e.tipe === 'KREDIT') totalDasarPengenaan += Number(e.jumlah);
      if (e.tipe === 'DEBIT') totalDasarPengenaan -= Number(e.jumlah);
    });

    if (totalDasarPengenaan < 0) totalDasarPengenaan = 0;
    const totalPajak = Math.round(totalDasarPengenaan * tarif * 100) / 100;

    const recap = await this.prisma.taxRecap.create({
      data: {
        tenantId,
        jenis_pajak: JenisPajak.PPN,
        periode,
        total_dasar_pengenaan: totalDasarPengenaan,
        total_pajak: totalPajak,
      },
    });

    return {
      ...recap,
      metodeSumber: 'GENERAL_LEDGER_ENTRIES',
      ppnKeluaran: { totalDpp: totalDasarPengenaan, totalPpn: totalPajak, jumlahDokumen: entries.length, dokumen: [] },
      ppnMasukan: { totalDpp: 0, totalPpn: 0, jumlahDokumen: 0, dokumen: [] },
      ppnKurangLebihBayar: totalPajak,
      posisiPajak: 'KURANG_BAYAR',
    };
  }

  // ==========================================
  // KALKULASI PPH 21 (PROGRESIF PASAL 17)
  // ==========================================

  /**
   * Helper Kalkulasi Tarif Progresif PPh Pasal 17 (UU HPP) per Tahun (disetahunkan).
   * Lapis 1: 0 - 60jt (5%)
   * Lapis 2: >60jt - 250jt (15%)
   * Lapis 3: >250jt - 500jt (25%)
   * Lapis 4: >500jt - 5M (30%)
   * Lapis 5: >5M (35%)
   * 
   * Asumsi MVP: Angka yang dimasukkan adalah total bruto sebulan dari jurnal "Rekan", 
   * maka kita tidak menyetahunkan dan tidak memotong PTKP karena ini agregat global (bukan per karyawan).
   * Namun, agar helper ini valid secara "logika pajak progresif", kita terapkan layer per bulan (dibagi 12).
   */
  public calculatePph21Progressive(brutoSebulan: number): number {
    let pajak = 0;
    let sisa = brutoSebulan;

    // Layer disebulankan (dibagi 12 dari tarif setahun)
    const lapis1 = 60_000_000 / 12; // 5jt
    const lapis2 = 250_000_000 / 12; // ~20.8jt
    const lapis3 = 500_000_000 / 12; // ~41.6jt
    const lapis4 = 5_000_000_000 / 12; // ~416.6jt

    // 5%
    if (sisa > 0) {
      const kenaPajak = Math.min(sisa, lapis1);
      pajak += kenaPajak * 0.05;
      sisa -= kenaPajak;
    }
    // 15%
    if (sisa > 0) {
      const porsi = lapis2 - lapis1;
      const kenaPajak = Math.min(sisa, porsi);
      pajak += kenaPajak * 0.15;
      sisa -= kenaPajak;
    }
    // 25%
    if (sisa > 0) {
      const porsi = lapis3 - lapis2;
      const kenaPajak = Math.min(sisa, porsi);
      pajak += kenaPajak * 0.25;
      sisa -= kenaPajak;
    }
    // 30%
    if (sisa > 0) {
      const porsi = lapis4 - lapis3;
      const kenaPajak = Math.min(sisa, porsi);
      pajak += kenaPajak * 0.30;
      sisa -= kenaPajak;
    }
    // 35%
    if (sisa > 0) {
      pajak += sisa * 0.35;
    }

    return pajak;
  }

  async calculatePPH21(tenantId: string, periode: string) {
    const setting = await this.getTaxSetting(tenantId);
    if (!setting.aktifkan_pph21) {
      throw new Error("Pengaturan PPh 21 tidak diaktifkan untuk tenant ini.");
    }

    const startDate = new Date(`${periode}-01T00:00:00Z`);
    const endOfMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    const endDate = new Date(`${endOfMonth.toISOString().split('T')[0]}T23:59:59Z`);

    // Ambil jurnal dari aplikasi "Rekan" yang merupakan jurnal payroll (beban gaji)
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        journal: {
          tenantId,
          status: { in: ['POSTED', 'APPROVED'] },
          sumber_aplikasi: { contains: 'Rekan', mode: 'insensitive' },
          tanggal: {
            gte: startDate,
            lte: endDate,
          },
        },
        chartOfAccount: {
          kategori: KategoriAkun.BEBAN,
        }
      },
    });

    let totalGajiBruto = 0;
    entries.forEach(e => {
      // Saldo beban normal Debit
      if (e.tipe === 'DEBIT') totalGajiBruto += Number(e.jumlah);
      if (e.tipe === 'KREDIT') totalGajiBruto -= Number(e.jumlah);
    });

    if (totalGajiBruto < 0) totalGajiBruto = 0;

    const estimasiPajak = this.calculatePph21Progressive(totalGajiBruto);

    const recap = await this.prisma.taxRecap.create({
      data: {
        tenantId,
        jenis_pajak: JenisPajak.PPH21,
        periode,
        total_dasar_pengenaan: totalGajiBruto,
        total_pajak: estimasiPajak,
      }
    });

    return recap;
  }

  // ==========================================
  // RIWAYAT REKAP
  // ==========================================

  async getTaxRecaps(tenantId: string, jenis?: JenisPajak, periode?: string) {
    return this.prisma.taxRecap.findMany({
      where: {
        tenantId,
        jenis_pajak: jenis ? jenis : undefined,
        periode: periode ? periode : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
