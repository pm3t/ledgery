import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ValuationStrategy,
  ReceiptParams,
  ReceiptResult,
  IssueParams,
  IssueResult,
  RecalculateResult,
} from './valuation.strategy.interface';

/**
 * Strategi Valuasi FIFO (First-In, First-Out)
 *
 * Pada metode ini:
 * 1. Setiap penerimaan barang (Receipt) mencatat satu lapisan biaya baru (StockCostLayer)
 *    dengan kuantitas awal, kuantitas sisa, dan biaya satuan perolehan asli.
 * 2. Setiap pengeluaran barang (Issue) mengonsumsi lapisan biaya tertua yang masih memiliki
 *    kuantitas sisa (urut berdasarkan tanggalMasuk ASC lalu id ASC).
 * 3. Setiap lapisan yang dikonsumsi dicatat ke tabel StockLayerConsumption agar HPP dapat
 *    ditelusuri ke faktur/dokumen penerimaan asalnya.
 * 4. Barang FIFO TIDAK PERNAH mengizinkan stok negatif dalam kondisi apa pun.
 * 5. StockBalance tetap diperbarui sebagai ringkasan agregat (total qty, total nilai semua lapisan, biaya rata-rata tertimbang).
 */
@Injectable()
export class FifoStrategy implements ValuationStrategy {
  private roundCost(num: number): number {
    return Math.round(num * 10000) / 10000;
  }

  private roundValue(num: number): number {
    return Math.round(num * 100) / 100;
  }

  async processReceipt(
    tx: Prisma.TransactionClient,
    params: ReceiptParams,
  ): Promise<ReceiptResult> {
    const {
      tenantId,
      itemId,
      warehouseId,
      qty,
      nilaiMasuk,
      tanggal,
      sourceDocType,
      sourceDocId,
      journalId,
      createdBy,
      tipeMovement = 'RECEIPT_PURCHASE',
      biayaSatuanKhusus,
    } = params;

    if (qty <= 0) {
      throw new BadRequestException('Kuantitas penerimaan stok harus lebih dari 0');
    }

    const finalNilaiMasuk =
      biayaSatuanKhusus !== undefined
        ? this.roundValue(qty * biayaSatuanKhusus)
        : this.roundValue(nilaiMasuk);

    const biayaSatuanMasuk =
      qty > 0 ? this.roundCost(finalNilaiMasuk / qty) : 0;

    // 1. Catat pergerakan stok masuk (StockMovement)
    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        tanggal,
        itemId,
        warehouseId,
        tipe: tipeMovement,
        qty: new Prisma.Decimal(qty),
        biayaSatuan: new Prisma.Decimal(biayaSatuanMasuk),
        nilai: new Prisma.Decimal(finalNilaiMasuk),
        sourceDocType,
        sourceDocId,
        journalId,
        createdBy,
      },
    });

    // 2. Buat lapisan biaya FIFO baru (StockCostLayer)
    const costLayer = await tx.stockCostLayer.create({
      data: {
        tenantId,
        itemId,
        warehouseId,
        movementMasukId: movement.id,
        tanggalMasuk: tanggal,
        qtyAwal: new Prisma.Decimal(qty),
        qtySisa: new Prisma.Decimal(qty),
        biayaSatuan: new Prisma.Decimal(biayaSatuanMasuk),
      },
    });

    // 3. Perbarui StockBalance agregat
    const balance = await tx.stockBalance.findUnique({
      where: {
        tenantId_itemId_warehouseId: { tenantId, itemId, warehouseId },
      },
    });

    const oldQty = balance ? Number(balance.qty) : 0;
    const oldNilai = balance ? Number(balance.nilai) : 0;

    const saldoQtyBaru = this.roundCost(oldQty + qty);
    const saldoNilaiBaru = this.roundValue(oldNilai + finalNilaiMasuk);
    const biayaRataRataBaru =
      saldoQtyBaru > 0 ? this.roundCost(saldoNilaiBaru / saldoQtyBaru) : 0;

    await tx.stockBalance.upsert({
      where: {
        tenantId_itemId_warehouseId: { tenantId, itemId, warehouseId },
      },
      create: {
        tenantId,
        itemId,
        warehouseId,
        qty: new Prisma.Decimal(saldoQtyBaru),
        nilai: new Prisma.Decimal(saldoNilaiBaru),
        biayaRataRata: new Prisma.Decimal(biayaRataRataBaru),
      },
      update: {
        qty: new Prisma.Decimal(saldoQtyBaru),
        nilai: new Prisma.Decimal(saldoNilaiBaru),
        biayaRataRata: new Prisma.Decimal(biayaRataRataBaru),
      },
    });

    return {
      movementId: movement.id,
      qtyMasuk: qty,
      nilaiMasuk: finalNilaiMasuk,
      biayaSatuan: biayaSatuanMasuk,
      saldoQtyBaru,
      saldoNilaiBaru,
      biayaRataRataBaru,
      costLayerId: costLayer.id,
    };
  }

  async processIssue(
    tx: Prisma.TransactionClient,
    params: IssueParams,
  ): Promise<IssueResult> {
    const {
      tenantId,
      itemId,
      warehouseId,
      qty,
      tanggal,
      sourceDocType,
      sourceDocId,
      journalId,
      createdBy,
      tipeMovement = 'ISSUE_SALE',
    } = params;

    if (qty <= 0) {
      throw new BadRequestException('Kuantitas pengeluaran stok harus lebih dari 0');
    }

    // Ambil lapisan biaya FIFO yang masih memiliki sisa stok, diurutkan tertua lebih dulu
    const availableLayers = await tx.stockCostLayer.findMany({
      where: {
        tenantId,
        itemId,
        warehouseId,
        qtySisa: { gt: 0 },
      },
      orderBy: [{ tanggalMasuk: 'asc' }, { id: 'asc' }],
    });

    // Hitung total kuantitas yang tersedia pada lapisan FIFO
    const totalAvailableQty = availableLayers.reduce(
      (sum, l) => sum + Number(l.qtySisa),
      0,
    );

    // KETENTUAN MUTLAK: Barang FIFO tidak pernah mengizinkan stok negatif
    if (totalAvailableQty < qty) {
      throw new BadRequestException(
        `Stok FIFO tidak mencukupi untuk barang ini di gudang terkait. Tersedia: ${totalAvailableQty}, diminta: ${qty}. Barang bervaluasi FIFO tidak diizinkan memiliki stok negatif.`,
      );
    }

    // 1. Buat StockMovement terlebih dahulu agar kita punya movementId untuk konsumsi lapisan
    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        tanggal,
        itemId,
        warehouseId,
        tipe: tipeMovement,
        qty: new Prisma.Decimal(-qty),
        biayaSatuan: new Prisma.Decimal(0), // Diperbarui setelah konsumsi selesai
        nilai: new Prisma.Decimal(0),
        sourceDocType,
        sourceDocId,
        journalId,
        createdBy,
      },
    });

    let remainingToConsume = qty;
    let totalHpp = 0;
    const consumedLayers: Array<{
      layerId: string;
      qty: number;
      biayaSatuan: number;
    }> = [];

    // 2. Konsumsi lapisan-lapisan tertua secara bertahap
    for (const layer of availableLayers) {
      if (remainingToConsume <= 0) break;

      const layerSisa = Number(layer.qtySisa);
      const layerBiaya = Number(layer.biayaSatuan);
      const consumeQty = Math.min(layerSisa, remainingToConsume);
      const consumeNilai = this.roundValue(consumeQty * layerBiaya);

      // Catat konsumsi lapisan
      await tx.stockLayerConsumption.create({
        data: {
          movementKeluarId: movement.id,
          layerId: layer.id,
          qty: new Prisma.Decimal(consumeQty),
          biayaSatuan: new Prisma.Decimal(layerBiaya),
        },
      });

      // Kurangi sisa kuantitas pada lapisan
      const newLayerSisa = this.roundCost(layerSisa - consumeQty);
      await tx.stockCostLayer.update({
        where: { id: layer.id },
        data: {
          qtySisa: new Prisma.Decimal(newLayerSisa),
        },
      });

      consumedLayers.push({
        layerId: layer.id,
        qty: consumeQty,
        biayaSatuan: layerBiaya,
      });

      totalHpp = this.roundValue(totalHpp + consumeNilai);
      remainingToConsume = this.roundCost(remainingToConsume - consumeQty);
    }

    const effectiveUnitCost = qty > 0 ? this.roundCost(totalHpp / qty) : 0;

    // 3. Perbarui movement dengan nilai HPP aktual
    await tx.stockMovement.update({
      where: { id: movement.id },
      data: {
        biayaSatuan: new Prisma.Decimal(effectiveUnitCost),
        nilai: new Prisma.Decimal(totalHpp),
      },
    });

    // 4. Perbarui StockBalance agregat
    const balance = await tx.stockBalance.findUnique({
      where: {
        tenantId_itemId_warehouseId: { tenantId, itemId, warehouseId },
      },
    });

    const oldQty = balance ? Number(balance.qty) : 0;
    const oldNilai = balance ? Number(balance.nilai) : 0;

    const saldoQtyBaru = this.roundCost(oldQty - qty);
    let saldoNilaiBaru = this.roundValue(oldNilai - totalHpp);

    if (saldoQtyBaru === 0) {
      saldoNilaiBaru = 0;
    }

    const biayaRataRataBaru =
      saldoQtyBaru > 0 ? this.roundCost(saldoNilaiBaru / saldoQtyBaru) : 0;

    await tx.stockBalance.upsert({
      where: {
        tenantId_itemId_warehouseId: { tenantId, itemId, warehouseId },
      },
      create: {
        tenantId,
        itemId,
        warehouseId,
        qty: new Prisma.Decimal(saldoQtyBaru),
        nilai: new Prisma.Decimal(saldoNilaiBaru),
        biayaRataRata: new Prisma.Decimal(biayaRataRataBaru),
      },
      update: {
        qty: new Prisma.Decimal(saldoQtyBaru),
        nilai: new Prisma.Decimal(saldoNilaiBaru),
        biayaRataRata: new Prisma.Decimal(biayaRataRataBaru),
      },
    });

    return {
      movementId: movement.id,
      qtyKeluar: qty,
      totalHpp,
      biayaSatuan: effectiveUnitCost,
      saldoQtyBaru,
      saldoNilaiBaru,
      biayaRataRataBaru,
      consumedLayers,
    };
  }

  async recalculateHistory(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
    warehouseId: string,
  ): Promise<RecalculateResult> {
    // 1. Ambil seluruh pergerakan kronologis
    const movements = await tx.stockMovement.findMany({
      where: { tenantId, itemId, warehouseId },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    let oldTotalHpp = 0;
    let newTotalHpp = 0;

    // Hitung total HPP lama untuk pelaporan selisih
    movements.forEach((m) => {
      if (Number(m.qty) < 0) {
        oldTotalHpp += Number(m.nilai);
      }
    });

    // 2. Bersihkan konsumsi lapisan dan lapisan lama
    await tx.stockLayerConsumption.deleteMany({
      where: {
        movementKeluar: {
          tenantId,
          itemId,
          warehouseId,
        },
      },
    });

    await tx.stockCostLayer.deleteMany({
      where: { tenantId, itemId, warehouseId },
    });

    // 3. Putar ulang seluruh transaksi secara berurutan
    // Lapisan virtual di memori untuk simulasi cepat
    interface SimLayer {
      id: string;
      movementId: string;
      tanggal: Date;
      qtyAwal: number;
      qtySisa: number;
      biayaSatuan: number;
    }

    const simLayers: SimLayer[] = [];

    for (const mov of movements) {
      const mQty = Number(mov.qty);
      const mNilai = Number(mov.nilai);

      if (mQty > 0) {
        // Penerimaan: buat lapisan baru di DB & memori
        const unitCost = this.roundCost(mNilai / mQty);
        const createdLayer = await tx.stockCostLayer.create({
          data: {
            tenantId,
            itemId,
            warehouseId,
            movementMasukId: mov.id,
            tanggalMasuk: mov.tanggal,
            qtyAwal: new Prisma.Decimal(mQty),
            qtySisa: new Prisma.Decimal(mQty),
            biayaSatuan: new Prisma.Decimal(unitCost),
          },
        });

        simLayers.push({
          id: createdLayer.id,
          movementId: mov.id,
          tanggal: mov.tanggal,
          qtyAwal: mQty,
          qtySisa: mQty,
          biayaSatuan: unitCost,
        });
      } else if (mQty < 0) {
        // Pengeluaran: konsumsi lapisan tertua
        const issueQty = Math.abs(mQty);
        let remToConsume = issueQty;
        let movHpp = 0;

        for (const simL of simLayers) {
          if (remToConsume <= 0) break;
          if (simL.qtySisa <= 0) continue;

          const take = Math.min(simL.qtySisa, remToConsume);
          const takeNilai = this.roundValue(take * simL.biayaSatuan);

          // Catat konsumsi
          await tx.stockLayerConsumption.create({
            data: {
              movementKeluarId: mov.id,
              layerId: simL.id,
              qty: new Prisma.Decimal(take),
              biayaSatuan: new Prisma.Decimal(simL.biayaSatuan),
            },
          });

          simL.qtySisa = this.roundCost(simL.qtySisa - take);
          remToConsume = this.roundCost(remToConsume - take);
          movHpp = this.roundValue(movHpp + takeNilai);
        }

        newTotalHpp += movHpp;
        const recalculatedUnitCost = issueQty > 0 ? this.roundCost(movHpp / issueQty) : 0;

        await tx.stockMovement.update({
          where: { id: mov.id },
          data: {
            biayaSatuan: new Prisma.Decimal(recalculatedUnitCost),
            nilai: new Prisma.Decimal(movHpp),
          },
        });
      }
    }

    // 4. Update qtySisa pada masing-masing StockCostLayer di DB
    for (const simL of simLayers) {
      await tx.stockCostLayer.update({
        where: { id: simL.id },
        data: {
          qtySisa: new Prisma.Decimal(simL.qtySisa),
        },
      });
    }

    // 5. Hitung saldo agregat akhir
    let finalQty = 0;
    let finalNilai = 0;
    simLayers.forEach((l) => {
      if (l.qtySisa > 0) {
        finalQty = this.roundCost(finalQty + l.qtySisa);
        finalNilai = this.roundValue(finalNilai + l.qtySisa * l.biayaSatuan);
      }
    });

    const finalAvgCost = finalQty > 0 ? this.roundCost(finalNilai / finalQty) : 0;

    await tx.stockBalance.upsert({
      where: {
        tenantId_itemId_warehouseId: { tenantId, itemId, warehouseId },
      },
      create: {
        tenantId,
        itemId,
        warehouseId,
        qty: new Prisma.Decimal(finalQty),
        nilai: new Prisma.Decimal(finalNilai),
        biayaRataRata: new Prisma.Decimal(finalAvgCost),
      },
      update: {
        qty: new Prisma.Decimal(finalQty),
        nilai: new Prisma.Decimal(finalNilai),
        biayaRataRata: new Prisma.Decimal(finalAvgCost),
      },
    });

    return {
      itemId,
      warehouseId,
      oldTotalHpp: this.roundValue(oldTotalHpp),
      newTotalHpp: this.roundValue(newTotalHpp),
      selisihHpp: this.roundValue(newTotalHpp - oldTotalHpp),
      recalculatedMovementsCount: movements.length,
    };
  }
}

