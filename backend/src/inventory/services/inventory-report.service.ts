import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventoryReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kartu Stok (Stock Card)
   * Menampilkan riwayat pergerakan stok, saldo awal, mutasi masuk/keluar, dan saldo akhir.
   * Untuk barang FIFO, menyertakan rincian lapisan biaya asal yang dikonsumsi pada tiap pengeluaran.
   */
  async getStockCard(
    tenantId: string,
    itemId: string,
    warehouseId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, tenantId },
    });
    if (!item) {
      throw new NotFoundException(`Barang ID "${itemId}" tidak ditemukan.`);
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
    });
    if (!warehouse) {
      throw new NotFoundException(`Gudang ID "${warehouseId}" tidak ditemukan.`);
    }

    const sDate = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const eDate = endDate ? new Date(endDate) : new Date();
    eDate.setHours(23, 59, 59, 999);

    // 1. Hitung saldo awal (seluruh pergerakan sebelum sDate)
    const priorMovements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        itemId,
        warehouseId,
        tanggal: { lt: sDate },
      },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    let saldoAwalQty = 0;
    let saldoAwalNilai = 0;

    for (const pm of priorMovements) {
      const q = Number(pm.qty);
      const n = Number(pm.nilai);
      saldoAwalQty += q;
      saldoAwalNilai += q >= 0 ? n : -n;
    }

    saldoAwalQty = Math.round(saldoAwalQty * 10000) / 10000;
    saldoAwalNilai = Math.round(saldoAwalNilai * 100) / 100;
    if (saldoAwalQty === 0) saldoAwalNilai = 0;

    // 2. Ambil mutasi dalam periode rentang tanggal
    const periodMovements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        itemId,
        warehouseId,
        tanggal: { gte: sDate, lte: eDate },
      },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: {
        consumptions: {
          include: {
            layer: true,
          },
        },
      },
    });

    let runningQty = saldoAwalQty;
    let runningNilai = saldoAwalNilai;

    const mutasi = periodMovements.map((m) => {
      const mQty = Number(m.qty);
      const mNilai = Number(m.nilai);
      const isMasuk = mQty > 0;

      const masukQty = isMasuk ? mQty : 0;
      const masukBiaya = isMasuk ? Number(m.biayaSatuan) : 0;
      const masukNilai = isMasuk ? mNilai : 0;

      const keluarQty = !isMasuk ? Math.abs(mQty) : 0;
      const keluarBiaya = !isMasuk ? Number(m.biayaSatuan) : 0;
      const keluarNilai = !isMasuk ? mNilai : 0;

      runningQty = Math.round((runningQty + mQty) * 10000) / 10000;
      runningNilai = Math.round((runningNilai + (isMasuk ? mNilai : -mNilai)) * 100) / 100;
      if (runningQty === 0) runningNilai = 0;

      const runningBiayaRataRata =
        runningQty > 0 ? Math.round((runningNilai / runningQty) * 10000) / 10000 : 0;

      return {
        id: m.id,
        tanggal: m.tanggal.toISOString().slice(0, 10),
        tipe: m.tipe,
        sourceDocType: m.sourceDocType,
        sourceDocId: m.sourceDocId,
        masuk: {
          qty: masukQty,
          biayaSatuan: masukBiaya,
          totalNilai: masukNilai,
        },
        keluar: {
          qty: keluarQty,
          biayaSatuan: keluarBiaya,
          totalNilai: keluarNilai,
        },
        saldoBerjalan: {
          qty: runningQty,
          biayaRataRata: runningBiayaRataRata,
          totalNilai: runningNilai,
        },
        // Rincian lapisan FIFO jika ada
        lapisanDikonsumsi: m.consumptions.map((c) => ({
          layerId: c.layerId,
          tanggalMasuk: c.layer.tanggalMasuk.toISOString().slice(0, 10),
          qty: Number(c.qty),
          biayaSatuan: Number(c.biayaSatuan),
          totalNilai: Math.round(Number(c.qty) * Number(c.biayaSatuan) * 100) / 100,
        })),
      };
    });

    return {
      item: {
        id: item.id,
        kode: item.kode,
        nama: item.nama,
        satuan: item.satuan,
        valuationMethod: item.valuationMethod,
      },
      warehouse: {
        id: warehouse.id,
        kode: warehouse.kode,
        nama: warehouse.nama,
      },
      periode: {
        startDate: sDate.toISOString().slice(0, 10),
        endDate: eDate.toISOString().slice(0, 10),
      },
      saldoAwal: {
        qty: saldoAwalQty,
        nilai: saldoAwalNilai,
        biayaRataRata:
          saldoAwalQty > 0
            ? Math.round((saldoAwalNilai / saldoAwalQty) * 10000) / 10000
            : 0,
      },
      mutasi,
      saldoAkhir: {
        qty: runningQty,
        nilai: runningNilai,
        biayaRataRata:
          runningQty > 0
            ? Math.round((runningNilai / runningQty) * 10000) / 10000
            : 0,
      },
    };
  }

  /**
   * Laporan Lapisan FIFO Tersisa (FIFO Cost Layers Aging)
   */
  async getFifoCostLayersReport(
    tenantId: string,
    itemId?: string,
    warehouseId?: string,
  ) {
    const where: any = {
      tenantId,
      qtySisa: { gt: 0 },
    };

    if (itemId) where.itemId = itemId;
    if (warehouseId) where.warehouseId = warehouseId;

    const layers = await this.prisma.stockCostLayer.findMany({
      where,
      orderBy: [{ tanggalMasuk: 'asc' }, { id: 'asc' }],
      include: {
        item: true,
        warehouse: true,
      },
    });

    const now = new Date();
    let totalNilaiSisa = 0;
    let totalQtySisa = 0;

    const items = layers.map((l) => {
      const qSisa = Number(l.qtySisa);
      const bSatuan = Number(l.biayaSatuan);
      const nSisa = Math.round(qSisa * bSatuan * 100) / 100;
      const diffMs = now.getTime() - new Date(l.tanggalMasuk).getTime();
      const ageDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      let ageBucket = '0-30 Hari';
      if (ageDays > 90) ageBucket = '>90 Hari';
      else if (ageDays > 60) ageBucket = '61-90 Hari';
      else if (ageDays > 30) ageBucket = '31-60 Hari';

      totalNilaiSisa += nSisa;
      totalQtySisa += qSisa;

      return {
        layerId: l.id,
        itemKode: l.item.kode,
        itemNama: l.item.nama,
        warehouseKode: l.warehouse.kode,
        warehouseNama: l.warehouse.nama,
        tanggalMasuk: l.tanggalMasuk.toISOString().slice(0, 10),
        qtyAwal: Number(l.qtyAwal),
        qtySisa: qSisa,
        biayaSatuan: bSatuan,
        totalNilaiSisa: nSisa,
        ageDays,
        ageBucket,
      };
    });

    return {
      totalLapisan: layers.length,
      totalQtySisa: Math.round(totalQtySisa * 10000) / 10000,
      totalNilaiSisa: Math.round(totalNilaiSisa * 100) / 100,
      layers: items,
    };
  }

  /**
   * Stok Saat Ini (Current Stock Summary)
   */
  async getCurrentStock(
    tenantId: string,
    params?: { warehouseId?: string; search?: string; groupCode?: string },
  ) {
    const where: any = { tenantId, tipe: 'STOK' };

    if (params?.groupCode) where.groupCode = params.groupCode;
    if (params?.search) {
      where.OR = [
        { kode: { contains: params.search, mode: 'insensitive' } },
        { nama: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.item.findMany({
      where,
      orderBy: { kode: 'asc' },
      include: {
        balances: {
          where: params?.warehouseId ? { warehouseId: params.warehouseId } : undefined,
          include: { warehouse: true },
        },
      },
    });

    let grandTotalQty = 0;
    let grandTotalNilai = 0;

    const data = items.map((item) => {
      let totalItemQty = 0;
      let totalItemNilai = 0;

      const balancesByWarehouse = item.balances.map((b) => {
        const q = Number(b.qty);
        const n = Number(b.nilai);
        totalItemQty += q;
        totalItemNilai += n;
        return {
          warehouseId: b.warehouseId,
          warehouseKode: b.warehouse.kode,
          warehouseNama: b.warehouse.nama,
          qty: q,
          biayaRataRata: Number(b.biayaRataRata),
          nilai: n,
        };
      });

      grandTotalQty += totalItemQty;
      grandTotalNilai += totalItemNilai;

      const avgCost =
        totalItemQty > 0
          ? Math.round((totalItemNilai / totalItemQty) * 10000) / 10000
          : 0;

      return {
        id: item.id,
        kode: item.kode,
        nama: item.nama,
        satuan: item.satuan,
        groupCode: item.groupCode,
        valuationMethod: item.valuationMethod,
        totalQty: Math.round(totalItemQty * 10000) / 10000,
        biayaRataRata: avgCost,
        totalNilai: Math.round(totalItemNilai * 100) / 100,
        balances: balancesByWarehouse,
      };
    });

    return {
      totalBarang: items.length,
      grandTotalQty: Math.round(grandTotalQty * 10000) / 10000,
      grandTotalNilai: Math.round(grandTotalNilai * 100) / 100,
      items: data,
    };
  }

  /**
   * Nilai Persediaan per Tanggal Posisi (Inventory Valuation as of Date)
   */
  async getInventoryValuationReport(
    tenantId: string,
    asOfDate?: string,
    warehouseId?: string,
  ) {
    const cutOff = asOfDate ? new Date(asOfDate) : new Date();
    cutOff.setHours(23, 59, 59, 999);

    const where: any = {
      tenantId,
      tanggal: { lte: cutOff },
    };
    if (warehouseId) where.warehouseId = warehouseId;

    const movements = await this.prisma.stockMovement.findMany({
      where,
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: {
        item: true,
        warehouse: true,
      },
    });

    // Agregasi per (itemId, warehouseId)
    const map = new Map<string, {
      item: any;
      warehouse: any;
      qty: number;
      nilai: number;
    }>();

    for (const m of movements) {
      const key = `${m.itemId}_${m.warehouseId}`;
      if (!map.has(key)) {
        map.set(key, {
          item: m.item,
          warehouse: m.warehouse,
          qty: 0,
          nilai: 0,
        });
      }

      const rec = map.get(key)!;
      const q = Number(m.qty);
      const n = Number(m.nilai);
      rec.qty += q;
      rec.nilai += q >= 0 ? n : -n;
    }

    let grandTotalNilai = 0;
    const items = [];

    for (const [_, rec] of map.entries()) {
      const q = Math.round(rec.qty * 10000) / 10000;
      let n = Math.round(rec.nilai * 100) / 100;
      if (q === 0) n = 0;

      if (q !== 0 || n !== 0) {
        grandTotalNilai += n;
        items.push({
          itemKode: rec.item.kode,
          itemNama: rec.item.nama,
          groupCode: rec.item.groupCode,
          satuan: rec.item.satuan,
          valuationMethod: rec.item.valuationMethod,
          warehouseKode: rec.warehouse.kode,
          warehouseNama: rec.warehouse.nama,
          qty: q,
          biayaRataRata: q > 0 ? Math.round((n / q) * 10000) / 10000 : 0,
          totalNilai: n,
        });
      }
    }

    return {
      asOfDate: cutOff.toISOString().slice(0, 10),
      grandTotalNilai: Math.round(grandTotalNilai * 100) / 100,
      items,
    };
  }
}

