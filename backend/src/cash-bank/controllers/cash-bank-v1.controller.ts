import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  HttpStatus,
  UseInterceptors,
  UseFilters,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../../api-v1/integration-log.interceptor';
import { V1ExceptionFilter } from '../../api-v1/v1-exception.filter';
import { resolveIdempotencyKey } from '../../common/utils/idempotency.util';
import { CashBankAccountService } from '../services/cash-bank-account.service';
import { CashDocumentService } from '../services/cash-document.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Controller API publik V1 untuk sub ledger Kas & Bank.
 * Terlindungi oleh ApiKeyGuard, terhubung dengan IntegrationLogInterceptor,
 * mendukung idempotency_key dan external_ref.
 */
@Controller('v1/cash')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class CashBankV1Controller {
  constructor(
    private readonly accountService: CashBankAccountService,
    private readonly docService: CashDocumentService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Helper untuk mencari CashBankAccount berdasarkan ID atau Kode
   */
  private async resolveAccount(tenantId: string, idOrKode: string) {
    let account = await this.prisma.cashBankAccount.findFirst({
      where: {
        tenantId,
        OR: [{ id: idOrKode }, { kode: idOrKode }],
      },
    });
    if (!account) {
      throw new NotFoundException(
        `Rekening Kas/Bank dengan id atau kode '${idOrKode}' tidak ditemukan`,
      );
    }
    return account;
  }

  /**
   * GET /v1/cash/accounts
   * Mengembalikan daftar rekening kas/bank aktif
   */
  @Get('accounts')
  async getAccounts(@Req() req: any) {
    const tenantId = req.tenantId;
    const accounts = await this.accountService.findAll(tenantId);
    return {
      status: 'success',
      data: accounts.map((acc) => ({
        id: acc.id,
        kode: acc.kode,
        nama: acc.nama,
        jenis: acc.jenis,
        mata_uang: acc.mata_uang,
        nama_bank: acc.namaBank,
        no_rekening: acc.noRekening,
        nama_pemilik: acc.namaPemilik,
        plafon_kas_kecil: acc.plafonKasKecil,
        is_active: acc.isActive,
      })),
    };
  }

  /**
   * GET /v1/cash/accounts/:id/balance?tanggal=YYYY-MM-DD
   * Mengembalikan saldo rekening per tanggal tertentu
   */
  @Get('accounts/:id/balance')
  async getAccountBalance(
    @Req() req: any,
    @Param('id') id: string,
    @Query('tanggal') tanggal?: string,
  ) {
    const tenantId = req.tenantId;
    const account = await this.resolveAccount(tenantId, id);
    const balanceInfo = await this.accountService.getBalance(
      account.id,
      tanggal,
    );
    return {
      status: 'success',
      data: {
        account_id: account.id,
        kode: account.kode,
        nama: account.nama,
        tanggal: tanggal || new Date().toISOString().split('T')[0],
        saldo: balanceInfo.saldoAkhir,
        saldo_fungsional: balanceInfo.saldoFungsionalAkhir,
        mata_uang: account.mata_uang,
      },
    };
  }

  /**
   * POST /v1/cash/receipts
   * Membuat dan langsung memposting penerimaan kas/bank
   */
  @Post('receipts')
  async createReceipt(@Req() req: any, @Body() body: any) {
    const tenantId = req.tenantId;
    const idempotencyKey = resolveIdempotencyKey(
      body.idempotency_key || body.idempotencyKey,
      req.headers['idempotency-key'] || req.headers['Idempotency-Key'],
    );

    if (idempotencyKey) {
      const existing = await this.prisma.cashReceipt.findFirst({
        where: { tenantId, idempotencyKey },
        include: { lines: true, cashBankAccount: true },
      });
      if (existing) {
        return {
          status: 'success',
          message: 'Idempotent response: Transaksi penerimaan kas sudah pernah diproses',
          data: existing,
        };
      }
    }

    const accountRef = body.cash_bank_account_id || body.rekening_id || body.rekening_kode;
    if (!accountRef) {
      throw new BadRequestException('Field rekening_id atau rekening_kode wajib diisi');
    }
    const account = await this.resolveAccount(tenantId, accountRef);

    const lines = (body.lines || body.baris || []).map((l: any) => ({
      akunLawanId: l.akun_lawan_id || l.akunLawanId,
      deskripsi: l.deskripsi || l.keterangan || 'Penerimaan Kas/Bank via API v1',
      jumlah: Number(l.jumlah || l.amount),
      dimensions: l.dimensions,
    }));

    if (lines.length === 0) {
      throw new BadRequestException('Baris rincian penerimaan (lines) wajib diisi');
    }

    // 1. Buat Draft
    const draft = await this.docService.createReceiptDraft(
      tenantId,
      {
        cashBankAccountId: account.id,
        tanggal: body.tanggal || new Date().toISOString().split('T')[0],
        mata_uang: body.mata_uang || account.mata_uang,
        kurs: body.kurs ? Number(body.kurs) : 1,
        catatan: body.catatan || body.keterangan,
        externalRef: body.external_ref,
        idempotencyKey,
        lines,
      },
      'API V1',
    );

    // 2. Langsung Post jika diminta atau default POST untuk API integrasi
    const shouldPost = body.status !== 'DRAFT';
    const finalDoc = shouldPost ? await this.docService.postReceipt(tenantId, draft.id) : draft;

    return {
      status: 'success',
      data: finalDoc,
    };
  }

  /**
   * POST /v1/cash/disbursements
   * Membuat dan langsung memposting pengeluaran kas/bank
   */
  @Post('disbursements')
  async createDisbursement(@Req() req: any, @Body() body: any) {
    const tenantId = req.tenantId;
    const idempotencyKey = resolveIdempotencyKey(
      body.idempotency_key || body.idempotencyKey,
      req.headers['idempotency-key'] || req.headers['Idempotency-Key'],
    );

    if (idempotencyKey) {
      const existing = await this.prisma.cashDisbursement.findFirst({
        where: { tenantId, idempotencyKey },
        include: { lines: true, cashBankAccount: true },
      });
      if (existing) {
        return {
          status: 'success',
          message: 'Idempotent response: Transaksi pengeluaran kas sudah pernah diproses',
          data: existing,
        };
      }
    }

    const accountRef = body.cash_bank_account_id || body.rekening_id || body.rekening_kode;
    if (!accountRef) {
      throw new BadRequestException('Field rekening_id atau rekening_kode wajib diisi');
    }
    const account = await this.resolveAccount(tenantId, accountRef);

    const lines = (body.lines || body.baris || []).map((l: any) => ({
      akunLawanId: l.akun_lawan_id || l.akunLawanId,
      deskripsi: l.deskripsi || l.keterangan || 'Pengeluaran Kas/Bank via API v1',
      jumlah: Number(l.jumlah || l.amount),
      dimensions: l.dimensions,
    }));

    if (lines.length === 0) {
      throw new BadRequestException('Baris rincian pengeluaran (lines) wajib diisi');
    }

    // 1. Buat Draft
    const draft = await this.docService.createDisbursementDraft(
      tenantId,
      {
        cashBankAccountId: account.id,
        tanggal: body.tanggal || new Date().toISOString().split('T')[0],
        mata_uang: body.mata_uang || account.mata_uang,
        kurs: body.kurs ? Number(body.kurs) : 1,
        catatan: body.catatan || body.keterangan,
        externalRef: body.external_ref,
        idempotencyKey,
        docVariant: body.doc_variant || body.docVariant,
        lines,
      },
      'API V1',
    );

    // 2. Langsung Post jika bukan draft
    const shouldPost = body.status !== 'DRAFT';
    const finalDoc = shouldPost
      ? await this.docService.postDisbursement(tenantId, draft.id)
      : draft;

    return {
      status: 'success',
      data: finalDoc,
    };
  }

  /**
   * POST /v1/cash/transfers
   * Membuat dan langsung memposting transfer kas/bank
   */
  @Post('transfers')
  async createTransfer(@Req() req: any, @Body() body: any) {
    const tenantId = req.tenantId;
    const idempotencyKey = resolveIdempotencyKey(
      body.idempotency_key || body.idempotencyKey,
      req.headers['idempotency-key'] || req.headers['Idempotency-Key'],
    );

    if (idempotencyKey) {
      const existing = await this.prisma.cashTransfer.findFirst({
        where: { tenantId, idempotencyKey },
        include: { dariAccount: true, keAccount: true },
      });
      if (existing) {
        return {
          status: 'success',
          message: 'Idempotent response: Transaksi transfer kas sudah pernah diproses',
          data: existing,
        };
      }
    }

    const dariRef = body.dari_account_id || body.dari_rekening_id || body.dari_rekening_kode;
    const keRef = body.ke_account_id || body.ke_rekening_id || body.ke_rekening_kode;

    if (!dariRef || !keRef) {
      throw new BadRequestException('Field dari_account_id dan ke_account_id wajib diisi');
    }

    const dariAccount = await this.resolveAccount(tenantId, dariRef);
    const keAccount = await this.resolveAccount(tenantId, keRef);

    // 1. Buat Draft
    const draft = await this.docService.createTransferDraft(
      tenantId,
      {
        dariAccountId: dariAccount.id,
        keAccountId: keAccount.id,
        tanggal: body.tanggal || new Date().toISOString().split('T')[0],
        jumlahKeluar: Number(body.jumlah_keluar || body.jumlahKeluar || body.amount),
        jumlahMasuk: body.jumlah_masuk
          ? Number(body.jumlah_masuk)
          : Number(body.jumlahKeluar || body.amount),
        kurs: body.kurs ? Number(body.kurs) : 1,
        biayaTransfer: body.biaya_transfer ? Number(body.biaya_transfer) : undefined,
        akunBiayaId: body.akun_biaya_id || body.akunBiayaId,
        catatan: body.catatan || body.keterangan,
        externalRef: body.external_ref,
        idempotencyKey,
        variant: body.variant,
      },
      'API V1',
    );

    // 2. Langsung Post jika bukan draft
    const shouldPost = body.status !== 'DRAFT';
    const finalDoc = shouldPost ? await this.docService.postTransfer(tenantId, draft.id) : draft;

    return {
      status: 'success',
      data: finalDoc,
    };
  }
}
