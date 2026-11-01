import { Injectable, Logger } from '@nestjs/common';
import { CashBankEntryDirection } from '@prisma/client';

export interface StatementLineCandidate {
  id: string;
  tanggal: Date;
  keterangan: string;
  referensi?: string | null;
  debit: number;
  kredit: number;
}

export interface BookEntryCandidate {
  id: string;
  tanggal: Date;
  arah: CashBankEntryDirection;
  jumlah: number;
  keterangan: string;
  sourceType: string;
  sourceDocId?: string | null;
}

export interface MatchResult {
  statementLineId: string;
  matchType: 'EXACT' | 'SUGGESTED' | 'GROUP_SUGGESTED' | 'NONE';
  confidenceScore: number; // 0 - 100
  matchedEntryIds: string[];
  totalAllocated: number;
  reason: string;
}

@Injectable()
export class BankAutoMatchService {
  private readonly logger = new Logger(BankAutoMatchService.name);

  /**
   * Menghitung saran pencocokan otomatis antara baris rekening koran dan entri buku kas.
   * Bersifat deterministik dan murni komputasional agar mudah diuji.
   */
  evaluateMatches(
    statementLines: StatementLineCandidate[],
    bookEntries: BookEntryCandidate[],
    autoMatchDays: number = 3,
  ): MatchResult[] {
    const results: MatchResult[] = [];
    const usedEntryIds = new Set<string>();

    for (const stmt of statementLines) {
      const isDebit = Number(stmt.debit) > 0;
      const stmtAmount = isDebit ? Number(stmt.debit) : Number(stmt.kredit);
      const expectedDirection = isDebit
        ? CashBankEntryDirection.KELUAR
        : CashBankEntryDirection.MASUK;

      // 1. Cari kandidat 1-ke-1 (Single Entry Match)
      const exactAmountCandidates = bookEntries.filter((entry) => {
        if (usedEntryIds.has(entry.id)) return false;
        if (entry.arah !== expectedDirection) return false;
        const diffAmt = Math.abs(Number(entry.jumlah) - stmtAmount);
        return diffAmt < 0.0001; // Toleransi pembulatan pecahan kecil
      });

      if (exactAmountCandidates.length > 0) {
        // Beri skor pada tiap kandidat
        const scoredCandidates = exactAmountCandidates.map((entry) => {
          let score = 60; // Basis kecocokan nominal persis

          // Skor tanggal
          const stmtTime = new Date(stmt.tanggal).getTime();
          const entryTime = new Date(entry.tanggal).getTime();
          const diffDays = Math.abs(Math.round((stmtTime - entryTime) / (1000 * 60 * 60 * 24)));

          if (diffDays === 0) {
            score += 30;
          } else if (diffDays <= autoMatchDays) {
            score += Math.max(10, 30 - diffDays * 5);
          } else {
            // Tanggal di luar rentang auto-match
            score -= Math.min(30, (diffDays - autoMatchDays) * 5);
          }

          // Skor kesamaan referensi / keterangan
          const refScore = this.calculateTextSimilarity(
            `${stmt.keterangan} ${stmt.referensi || ''}`,
            entry.keterangan,
          );
          score += refScore;

          return {
            entry,
            diffDays,
            score: Math.min(100, Math.max(0, score)),
          };
        });

        // Urutkan dari skor tertinggi
        scoredCandidates.sort((a, b) => b.score - a.score);
        const best = scoredCandidates[0];

        // Jika hanya ada 1 kandidat dan tanggal dalam toleransi serta skor >= 90 -> EXACT ("Pasti")
        if (
          scoredCandidates.length === 1 &&
          best.diffDays <= autoMatchDays &&
          best.score >= 90
        ) {
          usedEntryIds.add(best.entry.id);
          results.push({
            statementLineId: stmt.id,
            matchType: 'EXACT',
            confidenceScore: best.score,
            matchedEntryIds: [best.entry.id],
            totalAllocated: stmtAmount,
            reason: `Nominal identik (${stmtAmount}), tanggal selisih ${best.diffDays} hari, kandidat tunggal`,
          });
          continue;
        }

        // Jika ada beberapa kandidat atau tanggal sedikit berbeda -> SUGGESTED ("Disarankan")
        if (best.diffDays <= autoMatchDays && best.score >= 60) {
          results.push({
            statementLineId: stmt.id,
            matchType: 'SUGGESTED',
            confidenceScore: best.score,
            matchedEntryIds: [best.entry.id],
            totalAllocated: stmtAmount,
            reason: `Nominal identik (${stmtAmount}), ${scoredCandidates.length} kandidat berbobot serupa`,
          });
          continue;
        }
      }

      // 2. Cari kandidat Satu-ke-Banyak (Group Match: 1 statement line = 2 s/d 5 entri buku)
      // Contoh: Setoran gabungan (kredit bank Rp 1.500.000 = Rp 1.000.000 + Rp 500.000)
      const groupCandidates = bookEntries.filter((entry) => {
        if (usedEntryIds.has(entry.id)) return false;
        if (entry.arah !== expectedDirection) return false;
        return Number(entry.jumlah) <= stmtAmount;
      });

      const groupMatch = this.findSubsetSum(groupCandidates, stmtAmount, 5);
      if (groupMatch && groupMatch.length > 1) {
        // Cek tanggal rata-rata grup
        const stmtTime = new Date(stmt.tanggal).getTime();
        const allWithinDays = groupMatch.every((e) => {
          const diff = Math.abs(
            Math.round((stmtTime - new Date(e.tanggal).getTime()) / (1000 * 60 * 60 * 24)),
          );
          return diff <= autoMatchDays + 2;
        });

        if (allWithinDays) {
          results.push({
            statementLineId: stmt.id,
            matchType: 'GROUP_SUGGESTED',
            confidenceScore: 75,
            matchedEntryIds: groupMatch.map((e) => e.id),
            totalAllocated: stmtAmount,
            reason: `Setoran/pembayaran gabungan (${groupMatch.length} entri buku berjumlah ${stmtAmount})`,
          });
          continue;
        }
      }

      // Tidak ada kecocokan otomatis yang memenuhi syarat
      results.push({
        statementLineId: stmt.id,
        matchType: 'NONE',
        confidenceScore: 0,
        matchedEntryIds: [],
        totalAllocated: 0,
        reason: 'Tidak ada entri buku yang cocok dalam rentang toleransi',
      });
    }

    return results;
  }

  /**
   * Menghitung kesamaan teks sederhana untuk mendeteksi nomor bukti/referensi.
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const t1 = (text1 || '').toLowerCase();
    const t2 = (text2 || '').toLowerCase();
    if (!t1 || !t2) return 0;

    // Cari angka atau kode token panjang (mis. no transfer, invoice, cek)
    const tokens = t1.match(/[a-z0-9_-]{4,}/g) || [];
    for (const token of tokens) {
      if (t2.includes(token)) {
        return 10;
      }
    }
    return 0;
  }

  /**
   * Algoritma rekursif mencari subset kombinasi entri buku (maksimal maxItems) yang jumlahnya persis target.
   */
  private findSubsetSum(
    items: BookEntryCandidate[],
    target: number,
    maxItems: number = 5,
  ): BookEntryCandidate[] | null {
    // Batasi kandidat maksimal 15 entri untuk menghindari ledakan kombinatorial
    const limitedItems = items.slice(0, 15);

    function backtrack(
      startIndex: number,
      currentSum: number,
      currentSubset: BookEntryCandidate[],
    ): BookEntryCandidate[] | null {
      if (Math.abs(currentSum - target) < 0.0001) {
        return currentSubset;
      }
      if (currentSum > target || currentSubset.length >= maxItems) {
        return null;
      }

      for (let i = startIndex; i < limitedItems.length; i++) {
        const item = limitedItems[i];
        const res = backtrack(i + 1, currentSum + Number(item.jumlah), [...currentSubset, item]);
        if (res) return res;
      }
      return null;
    }

    return backtrack(0, 0, []);
  }
}

