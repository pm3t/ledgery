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
   */
  async calculatePPN(tenantId: string, periode: string) {
    // periode format: "YYYY-MM"
    const setting = await this.getTaxSetting(tenantId);
    const tarif = setting.tarif_ppn / 100; // default 0.11 (11%)

    // Cari jurnal di bulan tersebut yang diposting/disetujui
    const startDate = new Date(`${periode}-01T00:00:00Z`);
    const endOfMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    const endDate = new Date(`${endOfMonth.toISOString().split('T')[0]}T23:59:59Z`);

    // Untuk MVP PPN, kita ambil total Pendapatan (Kredit) sebagai dasar pengenaan PPN Keluaran.
    // Dalam realita, tidak semua pendapatan kena PPN. Tapi untuk estimasi ini kita asumsikan semua Pendapatan kena PPN 11%
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
        }
      },
    });

    let totalDasarPengenaan = 0;
    entries.forEach(e => {
      // Saldo normal pendapatan adalah kredit, jika kredit = tambah, debit = kurang
      if (e.tipe === 'KREDIT') totalDasarPengenaan += Number(e.jumlah);
      if (e.tipe === 'DEBIT') totalDasarPengenaan -= Number(e.jumlah);
    });

    if (totalDasarPengenaan < 0) totalDasarPengenaan = 0;

    const totalPajak = totalDasarPengenaan * tarif;

    // Simpan ke TaxRecap
    const recap = await this.prisma.taxRecap.create({
      data: {
        tenantId,
        jenis_pajak: JenisPajak.PPN,
        periode,
        total_dasar_pengenaan: totalDasarPengenaan,
        total_pajak: totalPajak,
      }
    });

    return recap;
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
