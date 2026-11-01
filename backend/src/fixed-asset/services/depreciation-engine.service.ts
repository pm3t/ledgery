import { Injectable } from '@nestjs/common';
import {
  DepreciationMethod,
  DepreciationConvention,
  FiscalGroupType,
  FiscalStartRule,
} from '@prisma/client';

export interface DepreciationScheduleItem {
  tahun: number;
  bulan: number; // 1 - 12
  periodeStr: string; // YYYY-MM
  beban: number; // Beban penyusutan bulan ini (dibulatkan 2 desimal)
  akumulasi: number; // Akumulasi penyusutan setelah bulan ini
  nilaiTercatat: number; // Nilai buku setelah bulan ini
  keterangan: string; // Catatan audit (Normal, Penyesuaian Residu, Pelunasan Akhir Fiskal, dll.)
}

export interface FullAssetSchedule {
  komersial: DepreciationScheduleItem[];
  fiskal: DepreciationScheduleItem[];
  komersialDisusutkanPenuh: boolean;
  fiskalDisusutkanPenuh: boolean;
}

export interface EngineAssetInput {
  id: string;
  hargaPerolehan: number;
  nilaiResidu: number;
  umurManfaatBulan: number;
  metodeKomersial: DepreciationMethod;
  faktorSaldoMenurun: number;
  tanggalPerolehan: Date;
  tanggalMulaiDigunakan?: Date | null;
  dapatDisusutkan: boolean;
  // Atribut Fiskal
  fiscalGroupId?: string | null;
  metodeFiskal: DepreciationMethod;
  aturanMulaiFiskal?: FiscalStartRule | null;
  fiskalMulaiTanggal?: Date | null;
  fiskalUmurOverrideBulan?: number | null;
}

export interface EngineFiscalGroupInput {
  id: string;
  kode: string;
  nama: string;
  jenis: FiscalGroupType;
  masaManfaatBulan: number;
  tarifGarisLurus: number; // Persentase, misal 25.0 untuk 25%
  tarifSaldoMenurun?: number | null; // Persentase, misal 50.0 untuk 50%
}

export interface EngineEstimateChangeInput {
  berlakuMulaiPeriode: string; // YYYY-MM
  umurBaruBulan?: number | null;
  sisaUmurBulan?: number | null;
  residuBaru?: number | null;
  metodeBaru?: DepreciationMethod | null;
}

export interface EngineCostAdditionInput {
  tanggal: Date;
  jumlah: number;
}

export interface EngineImpairmentInput {
  tanggal: Date;
  jumlah: number;
}

/**
 * Mesin Penyusutan Murni (Pure Depreciation Engine)
 * Menghitung jadwal dan alokasi penyusutan buku Komersial & Fiskal secara deterministik tanpa efek samping.
 * Mengacu pada standar akuntansi SAK (Komersial) dan PMK 72 Tahun 2023 (Penyusutan Fiskal).
 */
@Injectable()
export class DepreciationEngineService {
  /**
   * Pembulatan standar 2 desimal untuk menghindari selisih floating point
   */
  public round2(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  /**
   * Menentukan tahun dan bulan awal penyusutan komersial berdasarkan konvensi
   * - BULAN_PENUH: Penyusutan dimulai pada bulan yang sama dengan tanggalMulaiDigunakan
   * - BULAN_BERIKUTNYA: Penyusutan dimulai pada bulan berikutnya
   */
  public getCommercialStartMonth(
    inUseDate: Date,
    convention: DepreciationConvention,
  ): { tahun: number; bulan: number } {
    let year = inUseDate.getFullYear();
    let month = inUseDate.getMonth() + 1; // 1 - 12

    if (convention === DepreciationConvention.BULAN_BERIKUTNYA) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return { tahun: year, bulan: month };
  }

  /**
   * Menentukan tahun dan bulan awal penyusutan fiskal
   * - Default: Bulan perolehan (BULAN_PEROLEHAN)
   * - BULAN_PRODUKSI_KOMERSIAL: Bulan dimulainya produksi komersial (fiskalMulaiTanggal)
   */
  public getFiscalStartMonth(
    asset: EngineAssetInput,
  ): { tahun: number; bulan: number } {
    let targetDate = asset.tanggalPerolehan;

    if (
      asset.aturanMulaiFiskal === FiscalStartRule.BULAN_PRODUKSI_KOMERSIAL &&
      asset.fiskalMulaiTanggal
    ) {
      targetDate = asset.fiskalMulaiTanggal;
    }

    return {
      tahun: targetDate.getFullYear(),
      bulan: targetDate.getMonth() + 1,
    };
  }

  /**
   * Menghitung jadwal penyusutan Komersial secara lengkap dari awal hingga habis umur manfaat
   */
  public calculateCommercialSchedule(
    asset: EngineAssetInput,
    convention: DepreciationConvention = DepreciationConvention.BULAN_PENUH,
    estimateChanges: EngineEstimateChangeInput[] = [],
    costAdditions: EngineCostAdditionInput[] = [],
    impairments: EngineImpairmentInput[] = [],
  ): DepreciationScheduleItem[] {
    // Aset tidak dapat disusutkan (mis. Tanah) tidak menghasilkan entri
    if (!asset.dapatDisusutkan || !asset.tanggalMulaiDigunakan || asset.umurManfaatBulan <= 0) {
      return [];
    }

    const schedule: DepreciationScheduleItem[] = [];
    const start = this.getCommercialStartMonth(asset.tanggalMulaiDigunakan, convention);

    let curYear = start.tahun;
    let curMonth = start.bulan;

    let nilaiTercatat = asset.hargaPerolehan;
    let akumulasi = 0;
    let umurManfaatBulan = asset.umurManfaatBulan;
    let nilaiResidu = asset.nilaiResidu || 0;
    let metode = asset.metodeKomersial;
    let faktor = asset.faktorSaldoMenurun || 2.0;

    // Sort perubahan estimasi, penambahan nilai, dan penurunan nilai secara kronologis
    const sortedEstimates = [...estimateChanges].sort((a, b) =>
      a.berlakuMulaiPeriode.localeCompare(b.berlakuMulaiPeriode),
    );
    const sortedAdditions = [...costAdditions].sort(
      (a, b) => a.tanggal.getTime() - b.tanggal.getTime(),
    );
    const sortedImpairments = [...impairments].sort(
      (a, b) => a.tanggal.getTime() - b.tanggal.getTime(),
    );

    let totalBulanBerjalan = 0;
    let sisaBulan = umurManfaatBulan;

    while (sisaBulan > 0 && nilaiTercatat > nilaiResidu) {
      const periodeStr = `${curYear}-${String(curMonth).padStart(2, '0')}`;

      // 1. Cek apakah ada penambahan nilai (AssetCostAddition) pada bulan ini
      const additionsThisMonth = sortedAdditions.filter((ad) => {
        const adY = ad.tanggal.getFullYear();
        const adM = ad.tanggal.getMonth() + 1;
        return adY === curYear && adM === curMonth;
      });
      for (const ad of additionsThisMonth) {
        nilaiTercatat += ad.jumlah;
      }

      // 1b. Cek apakah ada Penurunan Nilai (AssetImpairment) pada bulan ini
      const impairmentsThisMonth = sortedImpairments.filter((im) => {
        const imY = im.tanggal.getFullYear();
        const imM = im.tanggal.getMonth() + 1;
        return imY === curYear && imM === curMonth;
      });
      for (const im of impairmentsThisMonth) {
        const jumlahPotong = Math.min(nilaiTercatat - nilaiResidu, im.jumlah);
        nilaiTercatat = this.round2(nilaiTercatat - jumlahPotong);
        akumulasi = this.round2(akumulasi + jumlahPotong);
      }

      // 2. Cek apakah ada Perubahan Estimasi Akuntansi (AssetEstimateChange) mulai periode ini
      const estChange = sortedEstimates.find((ec) => ec.berlakuMulaiPeriode === periodeStr);
      if (estChange) {
        if (estChange.residuBaru !== undefined && estChange.residuBaru !== null) {
          nilaiResidu = estChange.residuBaru;
        }
        if (estChange.sisaUmurBulan !== undefined && estChange.sisaUmurBulan !== null) {
          sisaBulan = estChange.sisaUmurBulan;
        } else if (estChange.umurBaruBulan !== undefined && estChange.umurBaruBulan !== null) {
          sisaBulan = Math.max(1, estChange.umurBaruBulan - totalBulanBerjalan);
        }
        if (estChange.metodeBaru) {
          metode = estChange.metodeBaru;
        }
      }

      let bebanBulanIni = 0;
      let keterangan = 'Penyusutan Komersial Normal';

      // 3. Perhitungan Beban Bulanan Berdasarkan Metode
      if (metode === DepreciationMethod.GARIS_LURUS) {
        // Rumus Garis Lurus: (Nilai Tercatat Saat Ini - Residu) / Sisa Umur Bulan
        const dasarSusut = Math.max(0, nilaiTercatat - nilaiResidu);
        if (sisaBulan === 1) {
          // Bulan Terakhir: Bebankan seluruh selisih sisa agar nilai tercatat TEPAT sama dengan residu
          bebanBulanIni = this.round2(dasarSusut);
          keterangan = 'Penyesuaian Bulan Terakhir Komersial (Tepat Nilai Residu)';
        } else {
          bebanBulanIni = this.round2(dasarSusut / sisaBulan);
          // Batasi agar tidak menembus nilai residu
          if (nilaiTercatat - bebanBulanIni < nilaiResidu) {
            bebanBulanIni = this.round2(nilaiTercatat - nilaiResidu);
          }
        }
      } else {
        // Rumus Saldo Menurun:
        // Tarif Tahunan = Faktor / (Umur Bulan / 12)
        // Beban Bulanan = Nilai Tercatat Awal Bulan * (Tarif Tahunan / 12)
        const tarifTahunan = faktor / (umurManfaatBulan / 12);
        const tarifBulanan = tarifTahunan / 12;

        if (sisaBulan === 1) {
          // Bulan Terakhir: Bebankan seluruh sisa nilai buku di atas nilai residu
          bebanBulanIni = this.round2(Math.max(0, nilaiTercatat - nilaiResidu));
          keterangan = 'Penyesuaian Bulan Terakhir Saldo Menurun Komersial';
        } else {
          bebanBulanIni = this.round2(nilaiTercatat * tarifBulanan);
          if (nilaiTercatat - bebanBulanIni < nilaiResidu) {
            bebanBulanIni = this.round2(Math.max(0, nilaiTercatat - nilaiResidu));
          }
        }
      }

      // Pastikan beban tidak negatif
      bebanBulanIni = Math.max(0, bebanBulanIni);
      nilaiTercatat = this.round2(nilaiTercatat - bebanBulanIni);
      akumulasi = this.round2(akumulasi + bebanBulanIni);

      schedule.push({
        tahun: curYear,
        bulan: curMonth,
        periodeStr,
        beban: bebanBulanIni,
        akumulasi,
        nilaiTercatat,
        keterangan,
      });

      totalBulanBerjalan += 1;
      sisaBulan -= 1;

      // Berpindah ke bulan berikutnya
      curMonth += 1;
      if (curMonth > 12) {
        curMonth = 1;
        curYear += 1;
      }
    }

    return schedule;
  }

  /**
   * Menghitung jadwal penyusutan Fiskal (Pajak) berdasarkan PMK 72 Tahun 2023
   * - Tanpa nilai residu (residu = 0)
   * - Menggunakan tarif dari FiscalDepreciationGroup (atau override masa manfaat bangunan permanen)
   * - Metode Garis Lurus atau Saldo Menurun
   * - Pada akhir masa manfaat Saldo Menurun, seluruh sisa nilai buku fiskal disusutkan sekaligus
   */
  public calculateFiscalSchedule(
    asset: EngineAssetInput,
    fiscalGroup?: EngineFiscalGroupInput | null,
    costAdditions: EngineCostAdditionInput[] = [],
  ): DepreciationScheduleItem[] {
    if (!asset.dapatDisusutkan || !fiscalGroup) {
      return [];
    }

    const schedule: DepreciationScheduleItem[] = [];
    const start = this.getFiscalStartMonth(asset);

    let curYear = start.tahun;
    let curMonth = start.bulan;

    let nilaiSisaBukuFiskal = asset.hargaPerolehan;
    let akumulasiFiskal = 0;

    // Tentukan masa manfaat dan tarif fiskal
    let masaManfaatBulan = fiscalGroup.masaManfaatBulan;
    let tarifGarisLurus = Number(fiscalGroup.tarifGarisLurus);
    let tarifSaldoMenurun = fiscalGroup.tarifSaldoMenurun ? Number(fiscalGroup.tarifSaldoMenurun) : null;

    // Override untuk Bangunan Permanen jika diatur lebih dari 20 tahun (PMK 72/2023 Pasal 6)
    if (
      fiscalGroup.jenis === FiscalGroupType.BANGUNAN &&
      asset.fiskalUmurOverrideBulan &&
      asset.fiskalUmurOverrideBulan > 0
    ) {
      masaManfaatBulan = asset.fiskalUmurOverrideBulan;
      const tahunOverride = masaManfaatBulan / 12;
      tarifGarisLurus = this.round2(100 / tahunOverride);
    }

    // Bangunan secara regulasi pajak hanya boleh menggunakan metode GARIS_LURUS
    const metodeFiskal =
      fiscalGroup.jenis === FiscalGroupType.BANGUNAN
        ? DepreciationMethod.GARIS_LURUS
        : asset.metodeFiskal || DepreciationMethod.GARIS_LURUS;

    const totalTahunManfaat = Math.ceil(masaManfaatBulan / 12);
    let sisaBulanManfaat = masaManfaatBulan;

    let tahunKe = 1;
    let awalTahunNilaiBuku = nilaiSisaBukuFiskal;

    const sortedAdditions = [...costAdditions].sort(
      (a, b) => a.tanggal.getTime() - b.tanggal.getTime(),
    );

    while (sisaBulanManfaat > 0 && nilaiSisaBukuFiskal > 0) {
      const isYearStart = curMonth === 1 || schedule.length === 0;
      if (isYearStart) {
        awalTahunNilaiBuku = nilaiSisaBukuFiskal;
      }

      // Hitung berapa bulan tersisa pada tahun kalender ini
      const sisaBulanTahunKalender = 12 - curMonth + 1;
      const bulanEfektifTahunIni = Math.min(sisaBulanManfaat, sisaBulanTahunKalender);

      // Hitung beban bulanan untuk tahun berjalan
      let bebanBulananTahunIni = 0;
      const isFinalYear = tahunKe >= totalTahunManfaat || sisaBulanManfaat <= 12;

      if (metodeFiskal === DepreciationMethod.GARIS_LURUS) {
        // Garis Lurus Fiskal: Tarif * Harga Perolehan per tahun
        // Jumlah tahunan dibagi rata 12 bulan (bulan efektif)
        const bebanTahunan = this.round2(asset.hargaPerolehan * (tarifGarisLurus / 100));
        bebanBulananTahunIni = this.round2(bebanTahunan / 12);
      } else {
        // Saldo Menurun Fiskal:
        const rate = (tarifSaldoMenurun || 50) / 100;
        if (isFinalYear) {
          // PMK 72/2023: Pada tahun terakhir masa manfaat, seluruh nilai sisa buku fiskal disusutkan sekaligus
          bebanBulananTahunIni = this.round2(awalTahunNilaiBuku / bulanEfektifTahunIni);
        } else {
          // Tahun 1 s.d (N-1): Tarif * Nilai Sisa Buku Awal Tahun
          const bebanTahunan = this.round2(awalTahunNilaiBuku * rate);
          bebanBulananTahunIni = this.round2(bebanTahunan / 12);
        }
      }

      // Iterasi bulan-bulan dalam tahun kalender berjalan
      for (let m = 0; m < bulanEfektifTahunIni; m++) {
        if (sisaBulanManfaat <= 0 || nilaiSisaBukuFiskal <= 0) break;

        const periodeStr = `${curYear}-${String(curMonth).padStart(2, '0')}`;

        // Cek penambahan pengeluaran lanjutan fiskal pada bulan ini
        const additionsThisMonth = sortedAdditions.filter((ad) => {
          const adY = ad.tanggal.getFullYear();
          const adM = ad.tanggal.getMonth() + 1;
          return adY === curYear && adM === curMonth;
        });
        for (const ad of additionsThisMonth) {
          nilaiSisaBukuFiskal += ad.jumlah;
        }

        let bebanBulanIni = bebanBulananTahunIni;
        let keterangan = 'Penyusutan Fiskal Normal (PMK 72/2023)';

        // Jika bulan terakhir masa manfaat fiskal, lunasi seluruh sisa buku fiskal
        if (sisaBulanManfaat === 1) {
          bebanBulanIni = this.round2(nilaiSisaBukuFiskal);
          keterangan = 'Pelunasan Akhir Masa Manfaat Fiskal (PMK 72/2023)';
        } else if (nilaiSisaBukuFiskal - bebanBulanIni < 0) {
          bebanBulanIni = this.round2(nilaiSisaBukuFiskal);
        }

        bebanBulanIni = Math.max(0, bebanBulanIni);
        nilaiSisaBukuFiskal = this.round2(nilaiSisaBukuFiskal - bebanBulanIni);
        akumulasiFiskal = this.round2(akumulasiFiskal + bebanBulanIni);

        schedule.push({
          tahun: curYear,
          bulan: curMonth,
          periodeStr,
          beban: bebanBulanIni,
          akumulasi: akumulasiFiskal,
          nilaiTercatat: nilaiSisaBukuFiskal,
          keterangan,
        });

        sisaBulanManfaat -= 1;

        curMonth += 1;
        if (curMonth > 12) {
          curMonth = 1;
          curYear += 1;
        }
      }

      tahunKe += 1;
    }

    return schedule;
  }

  /**
   * Menghasilkan jadwal komparatif gabungan (Komersial vs Fiskal berdampingan)
   */
  public generateFullSchedule(
    asset: EngineAssetInput,
    fiscalGroup?: EngineFiscalGroupInput | null,
    convention: DepreciationConvention = DepreciationConvention.BULAN_PENUH,
    estimateChanges: EngineEstimateChangeInput[] = [],
    costAdditions: EngineCostAdditionInput[] = [],
    impairments: EngineImpairmentInput[] = [],
  ): FullAssetSchedule {
    const komersial = this.calculateCommercialSchedule(
      asset,
      convention,
      estimateChanges,
      costAdditions,
      impairments,
    );
    const fiskal = this.calculateFiscalSchedule(
      asset,
      fiscalGroup,
      costAdditions,
    );

    const komersialDisusutkanPenuh =
      komersial.length > 0 &&
      komersial[komersial.length - 1].nilaiTercatat <= (asset.nilaiResidu || 0);

    const fiskalDisusutkanPenuh =
      fiskal.length > 0 &&
      fiskal[fiskal.length - 1].nilaiTercatat === 0;

    return {
      komersial,
      fiskal,
      komersialDisusutkanPenuh,
      fiskalDisusutkanPenuh,
    };
  }
}

