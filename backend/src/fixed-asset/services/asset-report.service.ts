import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Service Laporan Keuangan Subledger Aset Tetap:
 * 1. Daftar Aset Tetap per tanggal (dihitung dinamis dari perolehan, penambahan, dan entri penyusutan)
 * 2. Mutasi Aset Tetap (Roll-Forward PSAK 216 / PSAK 238)
 * 3. Penyusutan per Dimensi (Cost Center, Lokasi, Project)
 * 4. Jadwal Proyeksi Penyusutan (1-5 tahun ke depan)
 * 5. Rekonsiliasi Komersial vs Fiskal (Penyusutan, Beda Temporer, Laba/Rugi Pelepasan)
 * 6. Aset Disusutkan Penuh
 * 7. Laba / Rugi Pelepasan Aset
 *
 * Catatan Hak Akses: Peran PETUGAS_ASET ditolak di sisi server untuk seluruh laporan finansial ini.
 */
@Injectable()
export class AssetReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validasi peran pengguna: PETUGAS_ASET tidak boleh mengakses laporan finansial.
   */
  private checkAccessRole(role?: string) {
    if (role === 'PETUGAS_ASET') {
      throw new ForbiddenException(
        'Peran PETUGAS_ASET tidak diizinkan mengakses laporan keuangan aset tetap.',
      );
    }
  }

  // =========================================================================
  // 1. DAFTAR ASET TETAP PER TANGGAL
  // =========================================================================
  async getListReport(
    tenantId: string,
    params: {
      asOfDate?: string;
      categoryId?: string;
      dimensionValueId?: string;
      role?: string;
    },
  ) {
    this.checkAccessRole(params.role);

    const asOfStr = params.asOfDate || new Date().toISOString().slice(0, 10);
    const endOfDay = new Date(`${asOfStr}T23:59:59.999Z`);

    const where: any = {
      tenantId,
      tanggalPerolehan: { lte: endOfDay },
      status: { in: ['AKTIF', 'DISUSUTKAN_PENUH', 'DIJUAL', 'DIHAPUSKAN'] },
    };

    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }

    const assets = await this.prisma.fixedAsset.findMany({
      where,
      include: {
        category: true,
        fiscalGroup: true,
        costAdditions: {
          where: { tanggal: { lte: endOfDay }, status: 'POSTED' },
        },
        disposals: {
          where: { tanggal: { lte: endOfDay }, status: 'POSTED' },
        },
        depreciationEntries: {
          where: {
            status: 'AKTIF',
            createdAt: { lte: endOfDay },
          },
        },
        impairments: {
          where: { tanggal: { lte: endOfDay }, status: 'POSTED' },
        },
      },
      orderBy: { noAset: 'asc' },
    });

    const items: any[] = [];
    let totalPerolehan = 0;
    let totalAkumulasiKomersial = 0;
    let totalNilaiTercatatKomersial = 0;
    let totalAkumulasiFiskal = 0;
    let totalNilaiBukuFiskal = 0;

    for (const asset of assets) {
      // Lewati jika aset sudah dilepas pada atau sebelum tanggal laporan
      const isDisposed = asset.disposals.length > 0;
      if (isDisposed) continue;

      // Filter dimensi jika diminta
      if (params.dimensionValueId && asset.dimensions) {
        const dimStr = JSON.stringify(asset.dimensions);
        if (!dimStr.includes(params.dimensionValueId)) continue;
      }

      // Hitung harga perolehan per asOfDate (harga dasar + kapitalisasi/cost addition)
      let perolehan = Number(asset.hargaPerolehan);
      for (const add of asset.costAdditions) {
        perolehan += Number(add.jumlah);
      }

      // Akumulasi komersial & impairment
      const komersialEntries = asset.depreciationEntries.filter((e) => e.buku === 'KOMERSIAL');
      let akumulasiKomersial = komersialEntries.reduce((sum, e) => sum + Number(e.jumlah), 0);
      for (const imp of asset.impairments) {
        akumulasiKomersial += Number(imp.jumlah);
      }
      const nilaiTercatatKomersial = Math.max(0, perolehan - akumulasiKomersial);

      // Akumulasi fiskal
      const fiskalEntries = asset.depreciationEntries.filter((e) => e.buku === 'FISKAL');
      const akumulasiFiskal = fiskalEntries.reduce((sum, e) => sum + Number(e.jumlah), 0);
      const nilaiBukuFiskal = Math.max(0, perolehan - akumulasiFiskal);

      totalPerolehan += perolehan;
      totalAkumulasiKomersial += akumulasiKomersial;
      totalNilaiTercatatKomersial += nilaiTercatatKomersial;
      totalAkumulasiFiskal += akumulasiFiskal;
      totalNilaiBukuFiskal += nilaiBukuFiskal;

      items.push({
        id: asset.id,
        noAset: asset.noAset,
        tagCode: asset.tagCode,
        nama: asset.nama,
        kategori: asset.category.nama,
        kategoriKode: asset.category.kode,
        kelompokFiskal: asset.fiscalGroup ? asset.fiscalGroup.nama : '-',
        tanggalPerolehan: asset.tanggalPerolehan.toISOString().slice(0, 10),
        status: asset.status,
        statusLabel: asset.statusLabel,
        metodeKomersial: asset.metodeKomersial,
        metodeFiskal: asset.metodeFiskal,
        hargaPerolehan: perolehan,
        akumulasiKomersial,
        nilaiTercatatKomersial,
        akumulasiFiskal,
        nilaiBukuFiskal,
        dimensions: asset.dimensions,
      });
    }

    return {
      asOfDate: asOfStr,
      totalAssets: items.length,
      totals: {
        totalPerolehan: Math.round(totalPerolehan * 100) / 100,
        totalAkumulasiKomersial: Math.round(totalAkumulasiKomersial * 100) / 100,
        totalNilaiTercatatKomersial: Math.round(totalNilaiTercatatKomersial * 100) / 100,
        totalAkumulasiFiskal: Math.round(totalAkumulasiFiskal * 100) / 100,
        totalNilaiBukuFiskal: Math.round(totalNilaiBukuFiskal * 100) / 100,
      },
      items,
    };
  }

  // =========================================================================
  // 2. MUTASI ASET TETAP (ROLL-FORWARD PSAK 216 / PSAK 238)
  // =========================================================================
  async getRollForwardReport(
    tenantId: string,
    params: {
      startDate: string;
      endDate: string;
      categoryId?: string;
      role?: string;
    },
  ) {
    this.checkAccessRole(params.role);

    const start = new Date(`${params.startDate}T00:00:00.000Z`);
    const end = new Date(`${params.endDate}T23:59:59.999Z`);

    const categories = await this.prisma.assetCategory.findMany({
      where: {
        tenantId,
        ...(params.categoryId ? { id: params.categoryId } : {}),
      },
      orderBy: { kode: 'asc' },
    });

    const categoryRows: any[] = [];
    const totals = {
      costBeginning: 0,
      costAddition: 0,
      costDisposal: 0,
      costEnding: 0,
      depBeginning: 0,
      depExpense: 0,
      depImpairment: 0,
      depDisposal: 0,
      depEnding: 0,
      carryingBeginning: 0,
      carryingEnding: 0,
    };

    for (const cat of categories) {
      // Ambil seluruh aset dalam kategori ini
      const assets = await this.prisma.fixedAsset.findMany({
        where: { tenantId, categoryId: cat.id },
        include: {
          costAdditions: { where: { status: 'POSTED' } },
          disposals: { where: { status: 'POSTED' } },
          depreciationEntries: { where: { buku: 'KOMERSIAL', status: 'AKTIF' } },
          impairments: { where: { status: 'POSTED' } },
        },
      });

      let costBeginning = 0;
      let costAddition = 0;
      let costDisposal = 0;

      let depBeginning = 0;
      let depExpense = 0;
      let depImpairment = 0;
      let depDisposal = 0;

      for (const asset of assets) {
        if (asset.status === 'CIP') continue; // Roll forward aset tetap operasional

        const tglPerolehan = new Date(asset.tanggalPerolehan);
        const disposal = asset.disposals[0];
        const tglDisposal = disposal ? new Date(disposal.tanggal) : null;

        // 1. HARGA PEROLEHAN
        // Apakah diperoleh sebelum start?
        if (tglPerolehan < start) {
          // Apakah dilepas sebelum start?
          if (!tglDisposal || tglDisposal >= start) {
            costBeginning += Number(asset.hargaPerolehan);
          }
        } else if (tglPerolehan >= start && tglPerolehan <= end) {
          // Diperoleh pada periode berjalan
          costAddition += Number(asset.hargaPerolehan);
        }

        // Penambahan nilai (Cost Addition)
        for (const add of asset.costAdditions) {
          const tglAdd = new Date(add.tanggal);
          if (tglAdd < start) {
            if (!tglDisposal || tglDisposal >= start) {
              costBeginning += Number(add.jumlah);
            }
          } else if (tglAdd >= start && tglAdd <= end) {
            costAddition += Number(add.jumlah);
          }
        }

        // Pelepasan / Penghapusan
        if (disposal && tglDisposal && tglDisposal >= start && tglDisposal <= end) {
          // Hitung nilai perolehan saat dilepas
          let dispCost = Number(asset.hargaPerolehan);
          for (const add of asset.costAdditions) {
            if (new Date(add.tanggal) <= tglDisposal) {
              dispCost += Number(add.jumlah);
            }
          }
          costDisposal += dispCost;

          // Hitung akumulasi yang dieliminasi saat pelepasan
          let dispAccum = 0;
          for (const dep of asset.depreciationEntries) {
            if (new Date(dep.createdAt) <= tglDisposal) {
              dispAccum += Number(dep.jumlah);
            }
          }
          for (const imp of asset.impairments) {
            if (new Date(imp.tanggal) <= tglDisposal) {
              dispAccum += Number(imp.jumlah);
            }
          }
          depDisposal += dispAccum;
        }

        // 2. AKUMULASI PENYUSUTAN & PENURUNAN NILAI
        for (const dep of asset.depreciationEntries) {
          const tglDep = new Date(dep.createdAt);
          if (tglDep < start) {
            if (!tglDisposal || tglDisposal >= start) {
              depBeginning += Number(dep.jumlah);
            }
          } else if (tglDep >= start && tglDep <= end) {
            depExpense += Number(dep.jumlah);
          }
        }

        for (const imp of asset.impairments) {
          const tglImp = new Date(imp.tanggal);
          if (tglImp < start) {
            if (!tglDisposal || tglDisposal >= start) {
              depBeginning += Number(imp.jumlah);
            }
          } else if (tglImp >= start && tglImp <= end) {
            depImpairment += Number(imp.jumlah);
          }
        }
      }

      const costEnding = costBeginning + costAddition - costDisposal;
      const depEnding = depBeginning + depExpense + depImpairment - depDisposal;
      const carryingBeginning = costBeginning - depBeginning;
      const carryingEnding = costEnding - depEnding;

      totals.costBeginning += costBeginning;
      totals.costAddition += costAddition;
      totals.costDisposal += costDisposal;
      totals.costEnding += costEnding;
      totals.depBeginning += depBeginning;
      totals.depExpense += depExpense;
      totals.depImpairment += depImpairment;
      totals.depDisposal += depDisposal;
      totals.depEnding += depEnding;
      totals.carryingBeginning += carryingBeginning;
      totals.carryingEnding += carryingEnding;

      categoryRows.push({
        categoryId: cat.id,
        kode: cat.kode,
        nama: cat.nama,
        jenis: cat.jenis,
        // Perolehan
        costBeginning: Math.round(costBeginning * 100) / 100,
        costAddition: Math.round(costAddition * 100) / 100,
        costDisposal: Math.round(costDisposal * 100) / 100,
        costEnding: Math.round(costEnding * 100) / 100,
        // Akumulasi
        depBeginning: Math.round(depBeginning * 100) / 100,
        depExpense: Math.round(depExpense * 100) / 100,
        depImpairment: Math.round(depImpairment * 100) / 100,
        depDisposal: Math.round(depDisposal * 100) / 100,
        depEnding: Math.round(depEnding * 100) / 100,
        // Nilai Tercatat
        carryingBeginning: Math.round(carryingBeginning * 100) / 100,
        carryingEnding: Math.round(carryingEnding * 100) / 100,
      });
    }

    // Bulatkan total akhir
    Object.keys(totals).forEach((k) => {
      totals[k as keyof typeof totals] = Math.round(totals[k as keyof typeof totals] * 100) / 100;
    });

    return {
      period: { startDate: params.startDate, endDate: params.endDate },
      standards: 'PSAK 216 (Aset Tetap) & PSAK 238 (Aset Takberwujud)',
      totals,
      rows: categoryRows,
    };
  }

  // =========================================================================
  // 3. PENYUSUTAN PER DIMENSI (COST CENTER / LOKASI / PROJECT)
  // =========================================================================
  async getDepreciationByDimensionReport(
    tenantId: string,
    params: {
      periodId?: string;
      startDate?: string;
      endDate?: string;
      dimensionId?: string;
      role?: string;
    },
  ) {
    this.checkAccessRole(params.role);

    const where: any = {
      tenantId,
      buku: 'KOMERSIAL',
      status: 'AKTIF',
    };

    if (params.periodId) {
      where.periodBebanId = params.periodId;
    } else if (params.startDate && params.endDate) {
      where.createdAt = {
        gte: new Date(`${params.startDate}T00:00:00.000Z`),
        lte: new Date(`${params.endDate}T23:59:59.999Z`),
      };
    }

    const entries = await this.prisma.assetDepreciationEntry.findMany({
      where,
      include: {
        asset: {
          include: {
            category: true,
          },
        },
      },
    });

    // Ambil master dimensi tenant
    const dimensions = await this.prisma.dimension.findMany({
      where: { tenantId, isActive: true },
      include: { values: true },
    });

    // Kelompokkan beban berdasarkan nilai dimensi
    const dimensionSummary: Record<string, { namaDimensi: string; kodeNilai: string; namaNilai: string; totalBeban: number; jumlahAset: Set<string> }> = {};
    let grandTotal = 0;
    let unassignedTotal = 0;

    for (const entry of entries) {
      const amt = Number(entry.jumlah);
      grandTotal += amt;

      const assetDims = (entry.asset.dimensions as Record<string, string>) || {};
      let assigned = false;

      for (const dim of dimensions) {
        if (params.dimensionId && dim.id !== params.dimensionId) continue;

        const valId = assetDims[dim.nama_dimension] || assetDims[dim.id];
        if (valId) {
          const valObj = dim.values.find((v) => v.id === valId || v.kode === valId || v.nama === valId);
          const key = `${dim.id}_${valId}`;
          if (!dimensionSummary[key]) {
            dimensionSummary[key] = {
              namaDimensi: dim.nama_dimension,
              kodeNilai: valObj?.kode || valId,
              namaNilai: valObj?.nama || valId,
              totalBeban: 0,
              jumlahAset: new Set(),
            };
          }
          dimensionSummary[key].totalBeban += amt;
          dimensionSummary[key].jumlahAset.add(entry.assetId);
          assigned = true;
        }
      }

      if (!assigned) {
        unassignedTotal += amt;
      }
    }

    const items = Object.values(dimensionSummary).map((d) => ({
      namaDimensi: d.namaDimensi,
      kodeNilai: d.kodeNilai,
      namaNilai: d.namaNilai,
      totalBeban: Math.round(d.totalBeban * 100) / 100,
      jumlahAset: d.jumlahAset.size,
    }));

    return {
      period: { periodId: params.periodId, startDate: params.startDate, endDate: params.endDate },
      grandTotal: Math.round(grandTotal * 100) / 100,
      unassignedTotal: Math.round(unassignedTotal * 100) / 100,
      items,
    };
  }

  // =========================================================================
  // 4. JADWAL PENYUSUTAN PROYEKSI PER ASET / KATEGORI
  // =========================================================================
  async getDepreciationProjectionReport(
    tenantId: string,
    params: {
      categoryId?: string;
      assetId?: string;
      years?: number;
      role?: string;
    },
  ) {
    this.checkAccessRole(params.role);

    const numYears = params.years && params.years > 0 ? Math.min(params.years, 10) : 5;
    const currentYear = new Date().getFullYear();

    const where: any = {
      tenantId,
      status: 'AKTIF',
    };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.assetId) where.id = params.assetId;

    const assets = await this.prisma.fixedAsset.findMany({
      where,
      include: { category: true, fiscalGroup: true },
      orderBy: { noAset: 'asc' },
    });

    const yearlyProjections: Record<number, { year: number; totalKomersial: number; totalFiskal: number }> = {};
    for (let y = currentYear; y < currentYear + numYears; y++) {
      yearlyProjections[y] = { year: y, totalKomersial: 0, totalFiskal: 0 };
    }

    const assetItems: any[] = [];

    for (const asset of assets) {
      if (asset.status === 'CIP' || !asset.category.dapatDisusutkan) continue;

      const hargaPerolehan = Number(asset.hargaPerolehan);
      const nilaiResidu = Number(asset.nilaiResidu || 0);
      const akumulasiKomersial = Number(asset.akumulasiKomersial || 0);
      const umurBulan = asset.umurManfaatBulan;

      // Estimasi beban bulanan garis lurus
      const dasarSusut = Math.max(0, hargaPerolehan - nilaiResidu);
      const bebanKomersialPerBulan = umurBulan > 0 ? dasarSusut / umurBulan : 0;

      // Estimasi fiskal
      const tarifFiskal = asset.fiscalGroup ? Number(asset.fiscalGroup.tarifGarisLurus) / 100 : 0.0625;
      const bebanFiskalPerTahun = hargaPerolehan * tarifFiskal;

      const assetYearMap: Record<number, { komersial: number; fiskal: number }> = {};

      let currentBookValue = Math.max(0, hargaPerolehan - akumulasiKomersial);
      for (let y = currentYear; y < currentYear + numYears; y++) {
        // Komersial tahunan
        const komersialYear = Math.min(currentBookValue, bebanKomersialPerBulan * 12);
        currentBookValue = Math.max(nilaiResidu, currentBookValue - komersialYear);

        // Fiskal tahunan
        const fiskalYear = Math.min(hargaPerolehan, bebanFiskalPerTahun);

        assetYearMap[y] = {
          komersial: Math.round(komersialYear * 100) / 100,
          fiskal: Math.round(fiskalYear * 100) / 100,
        };

        yearlyProjections[y].totalKomersial += komersialYear;
        yearlyProjections[y].totalFiskal += fiskalYear;
      }

      assetItems.push({
        id: asset.id,
        noAset: asset.noAset,
        nama: asset.nama,
        kategori: asset.category.nama,
        hargaPerolehan,
        nilaiResidu,
        akumulasiKomersial,
        nilaiTercatat: Math.max(0, hargaPerolehan - akumulasiKomersial),
        projections: assetYearMap,
      });
    }

    return {
      years: Object.values(yearlyProjections).map((yp) => ({
        year: yp.year,
        totalKomersial: Math.round(yp.totalKomersial * 100) / 100,
        totalFiskal: Math.round(yp.totalFiskal * 100) / 100,
      })),
      assets: assetItems,
    };
  }

  // =========================================================================
  // 5. REKONSILIASI KOMERSIAL VS FISKAL (PAJAK)
  // =========================================================================
  async getCommercialVsFiscalReport(
    tenantId: string,
    params: {
      fiscalYear?: number;
      categoryId?: string;
      role?: string;
    },
  ) {
    this.checkAccessRole(params.role);

    const year = params.fiscalYear || new Date().getFullYear();
    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

    const assets = await this.prisma.fixedAsset.findMany({
      where: {
        tenantId,
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        tanggalPerolehan: { lte: endOfYear },
      },
      include: {
        category: true,
        fiscalGroup: true,
        depreciationEntries: {
          where: {
            periodeBukuTahun: year,
            status: 'AKTIF',
          },
        },
        disposals: {
          where: {
            tanggal: { gte: startOfYear, lte: endOfYear },
            status: 'POSTED',
          },
        },
      },
      orderBy: { noAset: 'asc' },
    });

    const items: any[] = [];
    let grandKomersial = 0;
    let grandFiskal = 0;
    let grandSelisih = 0;
    let grandLabaRugiKomersial = 0;
    let grandLabaRugiFiskal = 0;

    for (const asset of assets) {
      if (asset.status === 'CIP') continue;

      // Beban tahun buku ini
      const komersialEntries = asset.depreciationEntries.filter((e) => e.buku === 'KOMERSIAL');
      const fiskalEntries = asset.depreciationEntries.filter((e) => e.buku === 'FISKAL');

      const bebanKomersial = komersialEntries.reduce((s, e) => s + Number(e.jumlah), 0);
      const bebanFiskal = fiskalEntries.reduce((s, e) => s + Number(e.jumlah), 0);

      // Selisih penyusutan: Komersial > Fiskal = Koreksi Positif; Komersial < Fiskal = Koreksi Negatif
      const selisihPenyusutan = Math.round((bebanKomersial - bebanFiskal) * 100) / 100;
      const koreksiFiskal =
        selisihPenyusutan > 0 ? 'POSITIF' : selisihPenyusutan < 0 ? 'NEGATIF' : 'NIHIL';

      // Sisa buku komersial vs fiskal
      const nilaiTercatatKomersial = Number(asset.nilaiTercatat || 0);
      const nilaiSisaBukuFiskal = Number(asset.nilaiSisaBukuFiskal || 0);
      const bedaTemporer = Math.round((nilaiTercatatKomersial - nilaiSisaBukuFiskal) * 100) / 100;

      // Pelepasan di tahun ini (jika ada)
      const disposal = asset.disposals[0];
      const labaRugiKomersial = disposal ? Number(disposal.labaRugi) : null;
      const labaRugiFiskal = disposal ? Number(disposal.fiskalLabaRugi) : null;
      const selisihLabaRugi =
        labaRugiKomersial !== null && labaRugiFiskal !== null
          ? Math.round((labaRugiKomersial - labaRugiFiskal) * 100) / 100
          : null;

      grandKomersial += bebanKomersial;
      grandFiskal += bebanFiskal;
      grandSelisih += selisihPenyusutan;
      if (labaRugiKomersial !== null) grandLabaRugiKomersial += labaRugiKomersial;
      if (labaRugiFiskal !== null) grandLabaRugiFiskal += labaRugiFiskal;

      items.push({
        assetId: asset.id,
        noAset: asset.noAset,
        tagCode: asset.tagCode,
        nama: asset.nama,
        kategori: asset.category.nama,
        kelompokFiskal: asset.fiscalGroup ? asset.fiscalGroup.nama : 'Kelompok 3 (Default PMK 72)',
        tarifFiskal: asset.fiscalGroup ? `${Number(asset.fiscalGroup.tarifGarisLurus)}%` : '-',
        metodeKomersial: asset.metodeKomersial,
        metodeFiskal: asset.metodeFiskal,
        bebanKomersial: Math.round(bebanKomersial * 100) / 100,
        bebanFiskal: Math.round(bebanFiskal * 100) / 100,
        selisihPenyusutan,
        koreksiFiskal,
        nilaiTercatatKomersial,
        nilaiSisaBukuFiskal,
        bedaTemporer,
        pelepasan: disposal
          ? {
              tanggal: disposal.tanggal.toISOString().slice(0, 10),
              tipe: disposal.tipe,
              labaRugiKomersial,
              labaRugiFiskal,
              selisihLabaRugi,
            }
          : null,
      });
    }

    return {
      fiscalYear: year,
      acuan: 'PMK 72/2023 & UU PPh Pasal 11 / 11A',
      catatanPajak:
        'Laporan ini digunakan sebagai lampiran SPT Tahunan PPh Badan untuk rekonsiliasi fiskal aset tetap. Penyusutan fiskal adalah buku paralel tanpa jurnal GL, dan tidak menimbulkan jurnal pajak tangguhan.',
      summary: {
        totalKomersial: Math.round(grandKomersial * 100) / 100,
        totalFiskal: Math.round(grandFiskal * 100) / 100,
        totalKoreksiFiskal: Math.round(grandSelisih * 100) / 100,
        arahKoreksi: grandSelisih > 0 ? 'POSITIF' : grandSelisih < 0 ? 'NEGATIF' : 'NIHIL',
        totalLabaRugiPelepasanKomersial: Math.round(grandLabaRugiKomersial * 100) / 100,
        totalLabaRugiPelepasanFiskal: Math.round(grandLabaRugiFiskal * 100) / 100,
      },
      items,
    };
  }

  // =========================================================================
  // 6. ASET DISUSUTKAN PENUH
  // =========================================================================
  async getFullyDepreciatedReport(
    tenantId: string,
    params: { categoryId?: string; role?: string },
  ) {
    this.checkAccessRole(params.role);

    const assets = await this.prisma.fixedAsset.findMany({
      where: {
        tenantId,
        status: { in: ['AKTIF', 'DISUSUTKAN_PENUH'] },
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      },
      include: { category: true, fiscalGroup: true },
      orderBy: { tanggalPerolehan: 'asc' },
    });

    const items: any[] = [];
    for (const a of assets) {
      const perolehan = Number(a.hargaPerolehan);
      const residu = Number(a.nilaiResidu || 0);
      const akumulasi = Number(a.akumulasiKomersial || 0);
      const carrying = Math.max(0, perolehan - akumulasi);

      // Aset dianggap disusutkan penuh jika nilai tercatat sudah <= nilai residu
      if (carrying <= residu || a.status === 'DISUSUTKAN_PENUH') {
        items.push({
          id: a.id,
          noAset: a.noAset,
          tagCode: a.tagCode,
          nama: a.nama,
          kategori: a.category.nama,
          tanggalPerolehan: a.tanggalPerolehan.toISOString().slice(0, 10),
          hargaPerolehan: perolehan,
          nilaiResidu: residu,
          akumulasiKomersial: akumulasi,
          nilaiTercatat: carrying,
          status: a.status,
          statusLabel: a.statusLabel,
        });
      }
    }

    return {
      totalFullyDepreciated: items.length,
      items,
    };
  }

  // =========================================================================
  // 7. LABA / RUGI PELEPASAN ASET PERIODE BERJALAN
  // =========================================================================
  async getDisposalGainLossReport(
    tenantId: string,
    params: {
      startDate: string;
      endDate: string;
      categoryId?: string;
      role?: string;
    },
  ) {
    this.checkAccessRole(params.role);

    const start = new Date(`${params.startDate}T00:00:00.000Z`);
    const end = new Date(`${params.endDate}T23:59:59.999Z`);

    const disposals = await this.prisma.assetDisposal.findMany({
      where: {
        tenantId,
        tanggal: { gte: start, lte: end },
        status: 'POSTED',
        ...(params.categoryId ? { asset: { categoryId: params.categoryId } } : {}),
      },
      include: {
        asset: {
          include: { category: true },
        },
      },
      orderBy: { tanggal: 'desc' },
    });

    let totalHargaJual = 0;
    let totalNilaiBukuKomersial = 0;
    let totalLabaRugiKomersial = 0;
    let totalNilaiBukuFiskal = 0;
    let totalLabaRugiFiskal = 0;

    const items = disposals.map((d) => {
      const hargaJual = Number(d.hargaJual || 0);
      const nilaiBukuKomersial = Number(d.nilaiTercatatSaatPelepasan);
      const labaRugiKomersial = Number(d.labaRugi);
      const nilaiBukuFiskal = Number(d.fiskalSisaBuku);
      const labaRugiFiskal = Number(d.fiskalLabaRugi);
      const selisihLabaRugi = Math.round((labaRugiKomersial - labaRugiFiskal) * 100) / 100;

      totalHargaJual += hargaJual;
      totalNilaiBukuKomersial += nilaiBukuKomersial;
      totalLabaRugiKomersial += labaRugiKomersial;
      totalNilaiBukuFiskal += nilaiBukuFiskal;
      totalLabaRugiFiskal += labaRugiFiskal;

      return {
        id: d.id,
        noDokumen: d.noDokumen,
        tanggal: d.tanggal.toISOString().slice(0, 10),
        assetId: d.assetId,
        noAset: d.asset.noAset,
        namaAset: d.asset.nama,
        kategori: d.asset.category.nama,
        tipe: d.tipe,
        alasan: d.alasan,
        hargaJual,
        nilaiBukuKomersial,
        labaRugiKomersial,
        nilaiBukuFiskal,
        labaRugiFiskal,
        selisihLabaRugi,
      };
    });

    return {
      period: { startDate: params.startDate, endDate: params.endDate },
      totals: {
        totalHargaJual: Math.round(totalHargaJual * 100) / 100,
        totalNilaiBukuKomersial: Math.round(totalNilaiBukuKomersial * 100) / 100,
        totalLabaRugiKomersial: Math.round(totalLabaRugiKomersial * 100) / 100,
        totalNilaiBukuFiskal: Math.round(totalNilaiBukuFiskal * 100) / 100,
        totalLabaRugiFiskal: Math.round(totalLabaRugiFiskal * 100) / 100,
      },
      items,
    };
  }
}
