import { Injectable } from '@nestjs/common';
import { JournalService } from '../journal/journal.service';
import { EntryType } from '@prisma/client';

export interface SubledgerPostingEntry {
  kode_akun: string;
  tipe: 'DEBIT' | 'KREDIT' | EntryType;
  jumlah: number;
  dimensions?: { nama_dimension: string; kode_value: string }[];
}

export interface SubledgerPostingPayload {
  tanggal: string;
  sumber_aplikasi: 'SUBLEDGER-AR' | 'SUBLEDGER-AP' | 'SUBLEDGER-INV' | string;
  sourceDocType?: string;
  sourceDocId?: string;
  no_voucher?: string;
  deskripsi: string;
  mata_uang?: string;
  idempotency_key?: string;
  entries: SubledgerPostingEntry[];
}

/**
 * Service internal yang digunakan oleh modul subledger (AR, AP, Inventory)
 * untuk memposting jurnal GL secara otomatis ke JournalService.
 * Dikecualikan dari blokir akun kontrol (Control Account direct-posting lock).
 */
@Injectable()
export class SubledgerPostingService {
  constructor(private readonly journalService: JournalService) {}

  /**
   * Memposting transaksi dokumen subledger ke General Ledger.
   * Status jurnal otomatis POSTED, melewati validasi periode, balance, multicurrency, dan Dimensions.
   */
  async postSubledgerJournal(
    tenantId: string,
    payload: SubledgerPostingPayload,
  ) {
    const mappedEntries = payload.entries.map((e) => ({
      kode_akun: e.kode_akun,
      tipe: e.tipe as EntryType,
      jumlah: Number(e.jumlah),
      dimensions: e.dimensions,
    }));

    return await this.journalService.createFromSubledger(tenantId, {
      tanggal: payload.tanggal,
      deskripsi: payload.deskripsi,
      sumber_aplikasi: payload.sumber_aplikasi,
      sourceDocType: payload.sourceDocType,
      sourceDocId: payload.sourceDocId,
      no_voucher: payload.no_voucher,
      mata_uang: payload.mata_uang,
      idempotency_key: payload.idempotency_key,
      entries: mappedEntries,
    });
  }

  /**
   * Membuat jurnal pembalik (reversal) dari dokumen subledger yang dibatalkan / di-void.
   */
  async reverseJournal(
    tenantId: string,
    journalIdOrIdentifier: string,
    tanggal?: string,
    alasan?: string,
  ) {
    return await this.journalService.reverseFromSubledger(
      tenantId,
      journalIdOrIdentifier,
      tanggal,
      alasan,
    );
  }
}

