import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpStatus,
  UseInterceptors,
  UseFilters,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../api-v1/integration-log.interceptor';
import { V1ExceptionFilter } from '../api-v1/v1-exception.filter';
import { resolveIdempotencyKey } from '../common/utils/idempotency.util';
import { PurchaseBillService } from './purchase-bill.service';
import { VendorPaymentService } from './vendor-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseBillStatus } from '@prisma/client';

@Controller('v1')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class V1AccountsPayableController {
  constructor(
    private readonly purchaseBillService: PurchaseBillService,
    private readonly vendorPaymentService: VendorPaymentService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /v1/ap/bills
   * Membuat dan langsung memposting faktur pembelian via API publik V1.
   * Mendukung idempotency_key dan external_ref.
   */
  @Post('ap/bills')
  async createAndPostV1Bill(@Req() req: any, @Body() body: any) {
    const tenantId = req.tenantId;

    // 1. Resolusi Idempotency Key
    const headers = req?.headers || {};
    const headerKey =
      (headers['idempotency-key'] as string) ||
      (headers['Idempotency-Key'] as string);
    const resolvedKey = resolveIdempotencyKey(
      body.idempotency_key || body.idempotencyKey,
      headerKey,
    );

    // 2. Replay Check
    if (resolvedKey) {
      const existing = await this.prisma.purchaseBill.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: resolvedKey,
          },
        },
        include: { lines: true, partner: true, journal: true },
      });
      if (existing) {
        return {
          statusCode: HttpStatus.OK,
          isReplay: true,
          message: 'Faktur pembelian ditemukan dari request sebelumnya (Idempotent Replay)',
          data: existing,
        };
      }
    }

    // 3. Resolusi Vendor (bisa via partnerId, partnerKode/vendor_code, atau external_ref)
    let partnerId = body.partnerId;
    if (!partnerId && (body.partnerKode || body.vendor_code || body.vendorCode)) {
      const code = body.partnerKode || body.vendor_code || body.vendorCode;
      const p = await this.prisma.businessPartner.findUnique({
        where: { tenantId_kode: { tenantId, kode: code } },
      });
      if (p) partnerId = p.id;
    }
    if (!partnerId && (body.partnerExternalRef || body.vendorExternalRef)) {
      const ext = body.partnerExternalRef || body.vendorExternalRef;
      const p = await this.prisma.businessPartner.findUnique({
        where: { tenantId_externalRef: { tenantId, externalRef: ext } },
      });
      if (p) partnerId = p.id;
    }

    if (!partnerId) {
      throw new BadRequestException(
        'Vendor tidak valid. Harap sertakan partnerId, partnerKode, atau partnerExternalRef.',
      );
    }

    // 4. Normalisasi Baris
    const rawLines = body.lines || body.items || [];
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      throw new BadRequestException('Faktur pembelian harus memiliki minimal 1 baris item.');
    }

    const lines = await Promise.all(
      rawLines.map(async (l: any) => {
        let sourceLineType = l.sourceLineType || l.source_line_type || undefined;
        let sourceLineId = l.sourceLineId || l.source_line_id || undefined;

        // Dukungan goods_receipt_ref per baris
        if (!sourceLineId && (l.goods_receipt_ref || l.gr_ref || l.receipt_ref)) {
          const grRef = l.goods_receipt_ref || l.gr_ref || l.receipt_ref;
          const grLine = await this.prisma.goodsReceiptLine.findFirst({
            where: {
              receipt: { tenantId, OR: [{ noDokumen: grRef }, { externalRef: grRef }] },
              itemId: l.itemId || l.item_id || undefined,
            },
          });
          if (grLine) {
            sourceLineType = 'GR_LINE';
            sourceLineId = grLine.id;
          }
        }

        return {
          itemId: l.itemId || l.item_id || undefined,
          itemType: (l.itemType || l.item_type || 'SERVICE') as 'STOCK' | 'SERVICE',
          deskripsi: l.deskripsi || l.description || 'Pembelian Barang/Jasa',
          qty: Number(l.qty || l.quantity || 1),
          hargaSatuan: Number(l.hargaSatuan || l.harga_satuan || l.unit_price || 0),
          diskon: Number(l.diskon || l.discount || 0),
          ppnRate: Number(l.ppnRate || l.ppn_rate || l.tax_rate || 0),
          akunBiayaId: l.akunBiayaId || l.akun_biaya_id || undefined,
          dimensions: l.dimensions || undefined,
          sourceLineType,
          sourceLineId,
        };
      }),
    );

    const result = await this.purchaseBillService.createAndPostBill(
      tenantId,
      {
        tanggal: body.tanggal || body.date || new Date().toISOString().slice(0, 10),
        jatuhTempo:
          body.jatuhTempo ||
          body.jatuh_tempo ||
          body.due_date ||
          new Date().toISOString().slice(0, 10),
        partnerId,
        noFakturVendor: body.noFakturVendor || body.no_faktur_vendor || undefined,
        nomorFakturPajakMasukan: body.nomorFakturPajakMasukan || body.nomor_faktur_pajak_masukan || undefined,
        mata_uang: body.mata_uang || body.currency || undefined,
        kurs: body.kurs ? Number(body.kurs) : undefined,
        catatan: body.catatan || body.notes || undefined,
        externalRef: body.externalRef || body.external_ref || undefined,
        idempotencyKey: resolvedKey,
        lines,
      },
      'API V1 Client',
      resolvedKey,
      body.externalRef || body.external_ref,
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Faktur pembelian berhasil dibuat dan diposting ke GL',
      data: result,
    };
  }

  /**
   * POST /v1/ap/payments
   * Mencatat dan memposting pembayaran vendor via API publik V1.
   */
  @Post('ap/payments')
  async createAndPostV1Payment(@Req() req: any, @Body() body: any) {
    const tenantId = req.tenantId;

    // 1. Resolusi Idempotency Key
    const headers = req?.headers || {};
    const headerKey =
      (headers['idempotency-key'] as string) ||
      (headers['Idempotency-Key'] as string);
    const resolvedKey = resolveIdempotencyKey(
      body.idempotency_key || body.idempotencyKey,
      headerKey,
    );

    if (resolvedKey) {
      const existing = await this.prisma.vendorPayment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: resolvedKey,
          },
        },
        include: { allocations: true, partner: true, akunKasBank: true },
      });
      if (existing) {
        return {
          statusCode: HttpStatus.OK,
          isReplay: true,
          message: 'Pembayaran vendor ditemukan dari request sebelumnya (Idempotent Replay)',
          data: existing,
        };
      }
    }

    // 2. Resolusi Vendor
    let partnerId = body.partnerId;
    if (!partnerId && (body.partnerKode || body.vendor_code || body.vendorCode)) {
      const code = body.partnerKode || body.vendor_code || body.vendorCode;
      const p = await this.prisma.businessPartner.findUnique({
        where: { tenantId_kode: { tenantId, kode: code } },
      });
      if (p) partnerId = p.id;
    }

    if (!partnerId) {
      throw new BadRequestException('Vendor tidak ditemukan.');
    }

    // 3. Resolusi Akun Kas/Bank
    let akunKasBankId = body.akunKasBankId || body.cash_bank_account_id;
    if (!akunKasBankId && (body.kodeAkunKas || body.cash_bank_code)) {
      const kode = body.kodeAkunKas || body.cash_bank_code;
      const acc = await this.prisma.chartOfAccount.findUnique({
        where: { tenantId_kode_akun: { tenantId, kode_akun: kode } },
      });
      if (acc) akunKasBankId = acc.id;
    }

    if (!akunKasBankId) {
      throw new BadRequestException('Akun kas/bank wajib diisi (akunKasBankId atau kodeAkunKas).');
    }

    // 4. Resolusi Alokasi Faktur (bisa via billId atau noDokumen / external_ref faktur)
    const rawAllocations = body.allocations || [];
    const resolvedAllocations: any[] = [];

    for (const alloc of rawAllocations) {
      let bId = alloc.billId;
      if (!bId && (alloc.noDokumen || alloc.bill_no)) {
        const noDok = alloc.noDokumen || alloc.bill_no;
        const b = await this.prisma.purchaseBill.findUnique({
          where: { tenantId_noDokumen: { tenantId, noDokumen: noDok } },
        });
        if (b) bId = b.id;
      }
      if (!bId && (alloc.externalRef || alloc.external_ref)) {
        const ext = alloc.externalRef || alloc.external_ref;
        const b = await this.prisma.purchaseBill.findFirst({
          where: { tenantId, externalRef: ext },
        });
        if (b) bId = b.id;
      }

      if (bId) {
        resolvedAllocations.push({
          billId: bId,
          jumlahAlokasi: Number(alloc.jumlahAlokasi || alloc.amount || 0),
          kursAlokasi: alloc.kursAlokasi ? Number(alloc.kursAlokasi) : undefined,
        });
      }
    }

    const result = await this.vendorPaymentService.createAndPostPayment(
      tenantId,
      {
        tanggal: body.tanggal || body.date || new Date().toISOString().slice(0, 10),
        partnerId,
        akunKasBankId,
        jumlah: Number(body.jumlah || body.amount || 0),
        mata_uang: body.mata_uang || body.currency || undefined,
        kurs: body.kurs ? Number(body.kurs) : undefined,
        catatan: body.catatan || body.notes || undefined,
        externalRef: body.externalRef || body.external_ref || undefined,
        idempotencyKey: resolvedKey,
        allocations: resolvedAllocations,
      },
      'API V1 Client',
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Pembayaran vendor berhasil diposting dan dialokasikan',
      data: result,
    };
  }

  /**
   * GET /v1/ap/bills
   * Mengambil daftar faktur pembelian dengan filter status dan external_ref.
   */
  @Get('ap/bills')
  async getV1Bills(
    @Req() req: any,
    @Query('status') status?: PurchaseBillStatus,
    @Query('external_ref') external_ref?: string,
    @Query('externalRef') externalRef?: string,
    @Query('partnerId') partnerId?: string,
  ) {
    const tenantId = req.tenantId;
    const bills = await this.purchaseBillService.findAllBills(tenantId, {
      status,
      externalRef: external_ref || externalRef,
      partnerId,
    });

    return {
      statusCode: HttpStatus.OK,
      data: bills,
    };
  }
}

