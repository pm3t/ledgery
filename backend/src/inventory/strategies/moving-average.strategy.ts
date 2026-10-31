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
 * Strategi Valuasi Biaya Rata-Rata Bergerak (Moving Average)
 *
 * Pada metode ini:
 * 1. Setiap penerimaan barang (Receipt) menghitung ulang biaya rata-rata tertimbang:
 *    Biaya Rata-Rata Baru = (Nilai Stok Lama + Nilai Masuk) / (Kuantitas Lama + Kuantitas Masuk)
 * 2. Setiap pengeluaran barang (Issue) menggunakan biaya rata-rata yang berlaku pada saat transaksi:
 *    HPP = Kuantitas Keluar × Biaya Rata-Rata Saat Ini
 * 3. Pembulatan: Biaya satuan disimpan hingga 4 angka desimal, total nilai dibulatkan ke 2 angka desimal.
 * 4. Drift Prevention: Jika kuantitas akhir menjadi 0, saldo nilai otomatis di-nol-kan untuk menghindari sisa pembulatan.
 */
@Injectable()
export class MovingAverageStrategy implements ValuationStrategy {
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

    // Ambil saldo stok saat ini atau inisialisasi jika belum ada
    let balance = await tx.stockBalance.findUnique({
      where: {
        tenantId_itemId_warehouseId: { tenantId, itemId, warehouseId },
      },
    });

    const oldQty = balance ? Number(balance.qty) : 0;
    const oldNilai = balance ? Number(balance.nilai) : 0;

    const finalNilaiMasuk =
      biayaSatuanKhusus !== undefined
        ? this.roundValue(qty * biayaSatuanKhusus)
        : this.roundValue(nilaiMasuk);

    const biayaSatuanMasuk =
      qty > 0 ? this.roundCost(finalNilaiMasuk / qty) : 0;

    // Perhitungan biaya rata-rata bergerak baru
    const saldoQtyBaru = this.roundCost(oldQty + qty);
    let saldoNilaiBaru = this.roundValue(oldNilai + finalNilaiMasuk);
    let biayaRataRataBaru: number;

    if (oldQty <= 0) {
      // Jika sebelumnya saldo nol atau negatif, biaya rata-rata adalah biaya barang masuk ini
      biayaRataRataBaru = biayaSatuanMasuk;
    } else {
      biayaRataRataBaru = this.roundCost(saldoNilaiBaru / saldoQtyBaru);
    }

    // Catat pergerakan stok (StockMovement)
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

    // Perbarui saldo persediaan
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
      allowNegativeStock = false,
    } = params;

    if (qty <= 0) {
      throw new BadRequestException('Kuantitas pengeluaran stok harus lebih dari 0');
    }

    // Ambil saldo stok saat ini
    const balance = await tx.stockBalance.findUnique({
      where: {
        tenantId_itemId_warehouseId: { tenantId, itemId, warehouseId },
      },
    });

    const oldQty = balance ? Number(balance.qty) : 0;
    const oldNilai = balance ? Number(balance.nilai) : 0;
    const currentAvgCost = balance ? Number(balance.biayaRataRata) : 0;

    // Pemeriksaan stok negatif
    if (oldQty < qty && !allowNegativeStock) {
      throw new BadRequestException(
        `Stok tidak mencukupi untuk barang ini di gudang terkait. Tersedia: ${oldQty}, diminta: ${qty}. Mengizinkan stok negatif dinonaktifkan di pengaturan tenant.`,
      );
    }

    // Hitung total HPP berdasarkan biaya rata-rata yang sedang aktif
    const biayaSatuan = this.roundCost(currentAvgCost);
    const totalHpp = this.roundValue(qty * biayaSatuan);

    const saldoQtyBaru = this.roundCost(oldQty - qty);
    let saldoNilaiBaru = this.roundValue(oldNilai - totalHpp);

    // Mencegah nilai melayang jika stok habis total
    if (saldoQtyBaru === 0) {
      saldoNilaiBaru = 0;
    } else if (saldoQtyBaru < 0) {
      // Jika stok negatif diizinkan, nilai dihitung dari saldoQtyBaru * biayaSatuan
      saldoNilaiBaru = this.roundValue(saldoQtyBaru * biayaSatuan);
    }

    // Catat pergerakan keluar (qty bertanda negatif)
    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        tanggal,
        itemId,
        warehouseId,
        tipe: tipeMovement,
        qty: new Prisma.Decimal(-qty),
        biayaSatuan: new Prisma.Decimal(biayaSatuan),
        nilai: new Prisma.Decimal(totalHpp),
        sourceDocType,
        sourceDocId,
        journalId,
        createdBy,
      },
    });

    // Perbarui saldo persediaan
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
        biayaRataRata: new Prisma.Decimal(biayaSatuan),
      },
      update: {
        qty: new Prisma.Decimal(saldoQtyBaru),
        nilai: new Prisma.Decimal(saldoNilaiBaru),
        biayaRataRata: new Prisma.Decimal(biayaSatuan),
      },
    });

    return {
      movementId: movement.id,
      qtyKeluar: qty,
      totalHpp,
      biayaSatuan,
      saldoQtyBaru,
      saldoNilaiBaru,
      biayaRataRataBaru: biayaSatuan,
    };
  }

  async recalculateHistory(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
    warehouseId: string,
  ): Promise<RecalculateResult> {
    // Ambil seluruh pergerakan stok urut tanggal, createdAt, dan id secara deterministik
    const movements = await tx.stockMovement.findMany({
      where: { tenantId, itemId, warehouseId },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    let runningQty = 0;
    let runningNilai = 0;
    let runningAvgCost = 0;
    let oldTotalHpp = 0;
    let newTotalHpp = 0;

    for (const mov of movements) {
      const mQty = Number(mov.qty);
      const mNilai = Number(mov.nilai);

      if (mQty > 0) {
        // PERGERAKAN MASUK: Hitung ulang biaya rata-rata
        const newTotalQty = this.roundCost(runningQty + mQty);
        const newTotalNilai = this.roundValue(runningNilai + mNilai);

        if (runningQty <= 0) {
          runningAvgCost = this.roundCost(mNilai / mQty);
        } else {
          runningAvgCost = this.roundCost(newTotalNilai / newTotalQty);
        }

        runningQty = newTotalQty;
        runningNilai = newTotalNilai;
      } else if (mQty < 0) {
        // PERGERAKAN KELUAR: Hitung ulang HPP berdasarkan runningAvgCost yang berlaku
        const issueQty = Math.abs(mQty);
        const recalculatedCost = this.roundCost(runningAvgCost);
        const recalculatedHpp = this.roundValue(issueQty * recalculatedCost);

        oldTotalHpp += mNilai;
        newTotalHpp += recalculatedHpp;

        // Update nilai dan biaya satuan movement jika ada perbedaan
        if (Number(mov.biayaSatuan) !== recalculatedCost || mNilai !== recalculatedHpp) {
          await tx.stockMovement.update({
            where: { id: mov.id },
            data: {
              biayaSatuan: new Prisma.Decimal(recalculatedCost),
              nilai: new Prisma.Decimal(recalculatedHpp),
            },
          });
        }

        runningQty = this.roundCost(runningQty - issueQty);
        runningNilai = this.roundValue(runningNilai - recalculatedHpp);

        if (runningQty === 0) {
          runningNilai = 0;
        }
      }
    }

    // Update saldo akhir
    await tx.stockBalance.upsert({
      where: {
        tenantId_itemId_warehouseId: { tenantId, itemId, warehouseId },
      },
      create: {
        tenantId,
        itemId,
        warehouseId,
        qty: new Prisma.Decimal(runningQty),
        nilai: new Prisma.Decimal(runningNilai),
        biayaRataRata: new Prisma.Decimal(runningAvgCost),
      },
      update: {
        qty: new Prisma.Decimal(runningQty),
        nilai: new Prisma.Decimal(runningNilai),
        biayaRataRata: new Prisma.Decimal(runningAvgCost),
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

