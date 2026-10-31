import { Prisma, StockMovementType } from '@prisma/client';

export interface ReceiptParams {
  tenantId: string;
  itemId: string;
  warehouseId: string;
  qty: number;
  nilaiMasuk: number;
  tanggal: Date;
  sourceDocType?: string;
  sourceDocId?: string;
  journalId?: string;
  createdBy?: string;
  tipeMovement?: StockMovementType;
  costLayerId?: string; // Khusus transfer/retur jika membawa layer tertentu
  biayaSatuanKhusus?: number;
}

export interface ReceiptResult {
  movementId: string;
  qtyMasuk: number;
  nilaiMasuk: number;
  biayaSatuan: number;
  saldoQtyBaru: number;
  saldoNilaiBaru: number;
  biayaRataRataBaru: number;
  costLayerId?: string;
}

export interface IssueParams {
  tenantId: string;
  itemId: string;
  warehouseId: string;
  qty: number;
  tanggal: Date;
  sourceDocType?: string;
  sourceDocId?: string;
  journalId?: string;
  createdBy?: string;
  tipeMovement?: StockMovementType;
  allowNegativeStock?: boolean;
}

export interface IssueResult {
  movementId: string;
  qtyKeluar: number;
  totalHpp: number;
  biayaSatuan: number;
  saldoQtyBaru: number;
  saldoNilaiBaru: number;
  biayaRataRataBaru: number;
  consumedLayers?: Array<{
    layerId: string;
    qty: number;
    biayaSatuan: number;
  }>;
}

export interface RecalculateResult {
  itemId: string;
  warehouseId: string;
  oldTotalHpp: number;
  newTotalHpp: number;
  selisihHpp: number;
  recalculatedMovementsCount: number;
}

export interface ValuationStrategy {
  /**
   * Memproses pergerakan stok masuk (Receipt) dan memperbarui saldo/lapisan biaya
   */
  processReceipt(
    tx: Prisma.TransactionClient,
    params: ReceiptParams,
  ): Promise<ReceiptResult>;

  /**
   * Memproses pergerakan stok keluar (Issue), menghitung HPP, dan memperbarui saldo/lapisan biaya
   */
  processIssue(
    tx: Prisma.TransactionClient,
    params: IssueParams,
  ): Promise<IssueResult>;

  /**
   * Rekalkulasi saldo dan HPP berdasarkan urutan kronologis pergerakan stok (digunakan untuk backdated entry)
   */
  recalculateHistory(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemId: string,
    warehouseId: string,
  ): Promise<RecalculateResult>;
}

