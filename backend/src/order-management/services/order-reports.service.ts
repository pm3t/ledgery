import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, GoodsReceiptStatus, Prisma } from '@prisma/client';

@Injectable()
export class OrderReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Laporan Pesanan Belum Terpenuhi (Outstanding PO & SO)
   */
  async getOutstandingOrdersReport(
    tenantId: string,
    query?: {
      type?: 'PO' | 'SO' | 'ALL';
      partnerId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const type = query?.type || 'ALL';
    const now = Date.now();

    const result: {
      purchaseOrders: any[];
      salesOrders: any[];
      totalOutstandingPoValue: number;
      totalOutstandingSoValue: number;
    } = {
      purchaseOrders: [],
      salesOrders: [],
      totalOutstandingPoValue: 0,
      totalOutstandingSoValue: 0,
    };

    if (type === 'PO' || type === 'ALL') {
      const poWhere: Prisma.PurchaseOrderWhereInput = {
        tenantId,
        status: { in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
      };
      if (query?.partnerId) poWhere.partnerId = query.partnerId;
      if (query?.startDate || query?.endDate) {
        poWhere.tanggal = {};
        if (query.startDate) poWhere.tanggal.gte = new Date(query.startDate);
        if (query.endDate) poWhere.tanggal.lte = new Date(query.endDate);
      }

      const pos = await this.prisma.purchaseOrder.findMany({
        where: poWhere,
        orderBy: { tanggal: 'asc' },
        include: {
          partner: true,
          lines: { include: { item: true, warehouse: true } },
        },
      });

      for (const po of pos) {
        const orderDate = new Date(po.tanggal).getTime();
        const umurHari = Math.max(0, Math.floor((now - orderDate) / (1000 * 60 * 60 * 24)));

        const outstandingLines = po.lines
          .map((l) => {
            const qty = Number(l.qty);
            const diterima = Number(l.qtyDiterima);
            const sisaQty = Math.max(0, qty - diterima);
            const harga = Number(l.harga);
            const sisaNilai = sisaQty * harga;

            return {
              id: l.id,
              itemId: l.itemId,
              itemKode: l.item?.kode || '-',
              itemNama: l.item?.nama || l.deskripsi,
              satuan: l.item?.satuan || 'PCS',
              warehouseNama: l.warehouse?.nama || '-',
              qtyDipesan: qty,
              qtyDiterima: diterima,
              sisaQty,
              harga,
              sisaNilai,
            };
          })
          .filter((l) => l.sisaQty > 0);

        const poOutstandingValue = outstandingLines.reduce((sum, l) => sum + l.sisaNilai, 0);
        result.totalOutstandingPoValue += poOutstandingValue;

        if (outstandingLines.length > 0) {
          result.purchaseOrders.push({
            id: po.id,
            noDokumen: po.noDokumen,
            tanggal: po.tanggal,
            tanggalDiharapkan: po.tanggalDiharapkan,
            vendorNama: po.partner.nama,
            mata_uang: po.mata_uang,
            status: po.status,
            umurHari,
            totalNilaiOutstanding: poOutstandingValue,
            lines: outstandingLines,
          });
        }
      }
    }

    if (type === 'SO' || type === 'ALL') {
      const soWhere: Prisma.SalesOrderWhereInput = {
        tenantId,
        status: { in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
      };
      if (query?.partnerId) soWhere.partnerId = query.partnerId;
      if (query?.startDate || query?.endDate) {
        soWhere.tanggal = {};
        if (query.startDate) soWhere.tanggal.gte = new Date(query.startDate);
        if (query.endDate) soWhere.tanggal.lte = new Date(query.endDate);
      }

      const sos = await this.prisma.salesOrder.findMany({
        where: soWhere,
        orderBy: { tanggal: 'asc' },
        include: {
          partner: true,
          lines: { include: { item: true, warehouse: true } },
        },
      });

      for (const so of sos) {
        const orderDate = new Date(so.tanggal).getTime();
        const umurHari = Math.max(0, Math.floor((now - orderDate) / (1000 * 60 * 60 * 24)));

        const outstandingLines = so.lines
          .map((l) => {
            const qty = Number(l.qty);
            const dikirim = Number(l.qtyDikirim);
            const sisaQty = Math.max(0, qty - dikirim);
            const harga = Number(l.harga);
            const sisaNilai = sisaQty * harga;

            return {
              id: l.id,
              itemId: l.itemId,
              itemKode: l.item?.kode || '-',
              itemNama: l.item?.nama || l.deskripsi,
              satuan: l.item?.satuan || 'PCS',
              warehouseNama: l.warehouse?.nama || '-',
              qtyDipesan: qty,
              qtyDikirim: dikirim,
              sisaQty,
              harga,
              sisaNilai,
            };
          })
          .filter((l) => l.sisaQty > 0);

        const soOutstandingValue = outstandingLines.reduce((sum, l) => sum + l.sisaNilai, 0);
        result.totalOutstandingSoValue += soOutstandingValue;

        if (outstandingLines.length > 0) {
          result.salesOrders.push({
            id: so.id,
            noDokumen: so.noDokumen,
            tanggal: so.tanggal,
            tanggalDiharapkan: so.tanggalDiharapkan,
            customerNama: so.partner.nama,
            mata_uang: so.mata_uang,
            status: so.status,
            umurHari,
            totalNilaiOutstanding: soOutstandingValue,
            lines: outstandingLines,
          });
        }
      }
    }

    return result;
  }

  /**
   * Laporan Pemenuhan Order (Fulfillment: Dipesan vs Dipenuhi vs Ditagih)
   */
  async getOrderFulfillmentReport(
    tenantId: string,
    query?: {
      type?: 'PO' | 'SO' | 'ALL';
      startDate?: string;
      endDate?: string;
    },
  ) {
    const type = query?.type || 'ALL';
    const result: { poFulfillments: any[]; soFulfillments: any[] } = {
      poFulfillments: [],
      soFulfillments: [],
    };

    if (type === 'PO' || type === 'ALL') {
      const poWhere: Prisma.PurchaseOrderWhereInput = { tenantId };
      if (query?.startDate || query?.endDate) {
        poWhere.tanggal = {};
        if (query.startDate) poWhere.tanggal.gte = new Date(query.startDate);
        if (query.endDate) poWhere.tanggal.lte = new Date(query.endDate);
      }

      const pos = await this.prisma.purchaseOrder.findMany({
        where: poWhere,
        orderBy: { tanggal: 'desc' },
        include: {
          partner: true,
          lines: { include: { item: true } },
        },
      });

      result.poFulfillments = pos.map((po) => {
        let totalDipesan = 0;
        let totalDiterima = 0;
        let totalDitagih = 0;

        const lines = po.lines.map((l) => {
          const q = Number(l.qty);
          const rec = Number(l.qtyDiterima);
          const bil = Number(l.qtyDitagih);
          totalDipesan += q;
          totalDiterima += rec;
          totalDitagih += bil;

          return {
            itemId: l.itemId,
            itemKode: l.item?.kode,
            itemNama: l.item?.nama || l.deskripsi,
            qtyDipesan: q,
            qtyDiterima: rec,
            qtyDitagih: bil,
            persenDiterima: q > 0 ? Math.min(100, Math.round((rec / q) * 100)) : 0,
            persenDitagih: q > 0 ? Math.min(100, Math.round((bil / q) * 100)) : 0,
          };
        });

        const persenDiterima = totalDipesan > 0 ? Math.min(100, Math.round((totalDiterima / totalDipesan) * 100)) : 0;
        const persenDitagih = totalDipesan > 0 ? Math.min(100, Math.round((totalDitagih / totalDipesan) * 100)) : 0;

        return {
          id: po.id,
          noDokumen: po.noDokumen,
          tanggal: po.tanggal,
          partnerNama: po.partner.nama,
          status: po.status,
          totalDipesan,
          totalDiterima,
          totalDitagih,
          persenDiterima,
          persenDitagih,
          lines,
        };
      });
    }

    if (type === 'SO' || type === 'ALL') {
      const soWhere: Prisma.SalesOrderWhereInput = { tenantId };
      if (query?.startDate || query?.endDate) {
        soWhere.tanggal = {};
        if (query.startDate) soWhere.tanggal.gte = new Date(query.startDate);
        if (query.endDate) soWhere.tanggal.lte = new Date(query.endDate);
      }

      const sos = await this.prisma.salesOrder.findMany({
        where: soWhere,
        orderBy: { tanggal: 'desc' },
        include: {
          partner: true,
          lines: { include: { item: true } },
        },
      });

      result.soFulfillments = sos.map((so) => {
        let totalDipesan = 0;
        let totalDikirim = 0;
        let totalDitagih = 0;

        const lines = so.lines.map((l) => {
          const q = Number(l.qty);
          const del = Number(l.qtyDikirim);
          const bil = Number(l.qtyDitagih);
          totalDipesan += q;
          totalDikirim += del;
          totalDitagih += bil;

          return {
            itemId: l.itemId,
            itemKode: l.item?.kode,
            itemNama: l.item?.nama || l.deskripsi,
            qtyDipesan: q,
            qtyDikirim: del,
            qtyDitagih: bil,
            persenDikirim: q > 0 ? Math.min(100, Math.round((del / q) * 100)) : 0,
            persenDitagih: q > 0 ? Math.min(100, Math.round((bil / q) * 100)) : 0,
          };
        });

        const persenDikirim = totalDipesan > 0 ? Math.min(100, Math.round((totalDikirim / totalDipesan) * 100)) : 0;
        const persenDitagih = totalDipesan > 0 ? Math.min(100, Math.round((totalDitagih / totalDipesan) * 100)) : 0;

        return {
          id: so.id,
          noDokumen: so.noDokumen,
          tanggal: so.tanggal,
          partnerNama: so.partner.nama,
          status: so.status,
          totalDipesan,
          totalDikirim,
          totalDitagih,
          persenDikirim,
          persenDitagih,
          lines,
        };
      });
    }

    return result;
  }

  /**
   * Laporan Barang Diterima Belum Ditagih (GR/IR Clearing)
   * Mengaudit rincian baris Goods Receipt yang belum selesai ditagih vs saldo Buku Besar akun GR_IR_CLEARING.
   */
  async getGrIrClearingReport(tenantId: string) {
    // 1. Ambil akun GR_IR_CLEARING dari PostingSetup
    const grIrSetup = await this.prisma.postingSetup.findFirst({
      where: { tenantId, key: 'GR_IR_CLEARING' },
      include: { account: true },
    });

    let glBalance = 0;
    if (grIrSetup?.account) {
      const glEntries = await this.prisma.journalEntry.findMany({
        where: {
          chartOfAccountId: grIrSetup.account.id,
          journal: {
            tenantId,
            status: 'POSTED',
          },
        },
      });

      let debit = 0;
      let kredit = 0;
      for (const ent of glEntries) {
        if (ent.tipe === 'DEBIT') debit += Number(ent.jumlah);
        else kredit += Number(ent.jumlah);
      }
      // Akun kliring GR/IR bersaldo normal KREDIT saat ada barang diterima yang belum ditagih
      glBalance = Math.round((kredit - debit) * 100) / 100;
    }

    // 2. Ambil baris Goods Receipt yang berstatus POSTED dan qtyDitagih < qty
    const unbilledGrLines = await this.prisma.goodsReceiptLine.findMany({
      where: {
        receipt: {
          tenantId,
          status: GoodsReceiptStatus.POSTED,
        },
      },
      include: {
        receipt: {
          include: {
            partner: true,
            warehouse: true,
            po: true,
          },
        },
        item: true,
        poLine: true,
      },
      orderBy: { receipt: { tanggal: 'asc' } },
    });

    const items: any[] = [];
    let totalSubledgerUnbilled = 0;

    for (const l of unbilledGrLines) {
      const qtyDiterima = Number(l.qty);
      const qtyDitagih = Number(l.qtyDitagih);
      const sisaQty = Math.max(0, qtyDiterima - qtyDitagih);

      if (sisaQty > 0) {
        const biayaSatuan = Number(l.biayaSatuan);
        const nilaiBelumDitagih = Math.round(sisaQty * biayaSatuan * 100) / 100;
        totalSubledgerUnbilled += nilaiBelumDitagih;

        items.push({
          grId: l.receipt.id,
          noGr: l.receipt.noDokumen,
          tanggalGr: l.receipt.tanggal,
          poId: l.receipt.poId,
          noPo: l.receipt.po?.noDokumen || '-',
          vendorNama: l.receipt.partner.nama,
          warehouseNama: l.receipt.warehouse.nama,
          itemId: l.itemId,
          itemKode: l.item.kode,
          itemNama: l.item.nama,
          satuan: l.item.satuan,
          qtyDiterima,
          qtyDitagih,
          sisaQtyBelumDitagih: sisaQty,
          biayaSatuan,
          nilaiBelumDitagih,
        });
      }
    }

    totalSubledgerUnbilled = Math.round(totalSubledgerUnbilled * 100) / 100;
    const selisih = Math.round((glBalance - totalSubledgerUnbilled) * 100) / 100;
    const isReconciled = Math.abs(selisih) < 0.01;

    return {
      grIrAccount: grIrSetup?.account
        ? {
            id: grIrSetup.account.id,
            kode: grIrSetup.account.kode_akun,
            nama: grIrSetup.account.nama_akun,
          }
        : null,
      glBalance,
      totalSubledgerUnbilled,
      selisih,
      statusRekonsiliasi: isReconciled ? 'RECONCILED' : 'SELISIH',
      keterangan: isReconciled
        ? 'Saldo akun kliring GR/IR di Buku Besar cocok sempurna dengan rincian penerimaan barang belum ditagih.'
        : `Ditemukan selisih sebesar Rp ${Math.abs(selisih).toLocaleString('id-ID')} antara saldo Buku Besar (Rp ${glBalance.toLocaleString('id-ID')}) dan total subledger (Rp ${totalSubledgerUnbilled.toLocaleString('id-ID')}).`,
      items,
    };
  }
}

