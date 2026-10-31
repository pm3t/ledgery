import {
  Controller,
  Get,
  Post,
  Put,
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
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../api-v1/integration-log.interceptor';
import { V1ExceptionFilter } from '../api-v1/v1-exception.filter';
import { resolveIdempotencyKey } from '../common/utils/idempotency.util';
import { SalesInvoiceService } from './sales-invoice.service';
import { CustomerReceiptService } from './customer-receipt.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesInvoiceStatus } from '@prisma/client';

@Controller('v1')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class V1AccountsReceivableController {
  constructor(
    private readonly salesInvoiceService: SalesInvoiceService,
    private readonly customerReceiptService: CustomerReceiptService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /v1/ar/invoices
   * Membuat dan langsung memposting faktur penjualan via API publik V1.
   * Mendukung idempotency_key dan external_ref.
   */
  @Post('ar/invoices')
  async createAndPostV1Invoice(@Req() req: any, @Body() body: any) {
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
      const existing = await this.prisma.salesInvoice.findUnique({
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
          message: 'Faktur penjualan ditemukan dari request sebelumnya (Idempotent Replay)',
          data: existing,
        };
      }
    }

    // 3. Resolusi Partner (bisa via partnerId, partnerKode, atau external_ref)
    let partnerId = body.partnerId;
    if (!partnerId && (body.partnerKode || body.customer_code)) {
      const code = body.partnerKode || body.customer_code;
      const p = await this.prisma.businessPartner.findUnique({
        where: { tenantId_kode: { tenantId, kode: code } },
      });
      if (p) partnerId = p.id;
    }
    if (!partnerId && body.partnerExternalRef) {
      const p = await this.prisma.businessPartner.findUnique({
        where: { tenantId_externalRef: { tenantId, externalRef: body.partnerExternalRef } },
      });
      if (p) partnerId = p.id;
    }

    if (!partnerId) {
      throw new BadRequestException(
        'Pelanggan tidak valid. Harap sertakan partnerId, partnerKode, atau partnerExternalRef.',
      );
    }

    // 4. Normalisasi Baris
    const rawLines = body.lines || body.items || [];
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      throw new BadRequestException('Faktur harus memiliki minimal satu baris item.');
    }

    const lines = await Promise.all(
      rawLines.map(async (l: any) => {
        let sourceLineType = l.sourceLineType || l.source_line_type || null;
        let sourceLineId = l.sourceLineId || l.source_line_id || null;

        // Dukungan delivery_ref per baris
        if (!sourceLineId && (l.delivery_ref || l.delivery_order_ref || l.do_ref)) {
          const doRef = l.delivery_ref || l.delivery_order_ref || l.do_ref;
          const doLine = await this.prisma.deliveryOrderLine.findFirst({
            where: {
              delivery: { tenantId, OR: [{ noDokumen: doRef }, { externalRef: doRef }] },
              itemId: l.itemId || l.item_id || undefined,
            },
          });
          if (doLine) {
            sourceLineType = 'DO_LINE';
            sourceLineId = doLine.id;
          }
        }

        return {
          itemId: l.itemId || l.item_id || null,
          itemType: (l.itemType || l.item_type || 'SERVICE') as 'STOCK' | 'SERVICE',
          deskripsi: l.deskripsi || l.description || 'Penjualan Barang/Jasa',
          qty: Number(l.qty || l.quantity || 1),
          hargaSatuan: Number(l.hargaSatuan || l.price || l.unit_price || 0),
          diskon: Number(l.diskon || l.discount || 0),
          ppnRate: Number(l.ppnRate || l.ppn_rate || l.tax_rate || 0),
          akunPendapatanId: l.akunPendapatanId || l.revenue_account_id || null,
          dimensions: l.dimensions || undefined,
          sourceLineType,
          sourceLineId,
        };
      }),
    );

    // 5. Buat Draft Faktur
    const draft = await this.salesInvoiceService.createDraft(
      tenantId,
      {
        tanggal: body.tanggal || body.date || new Date().toISOString().slice(0, 10),
        jatuhTempo: body.jatuhTempo || body.due_date || body.tanggal || new Date().toISOString().slice(0, 10),
        partnerId,
        mata_uang: body.mata_uang || body.currency,
        kurs: body.kurs ? Number(body.kurs) : undefined,
        catatan: body.catatan || body.notes,
        externalRef: body.externalRef || body.external_ref,
        idempotencyKey: resolvedKey || undefined,
        lines,
      },
      req.apiKeyLabel || 'API-V1',
    );

    // 6. Langsung Posting ke General Ledger
    const posted = await this.salesInvoiceService.postInvoice(tenantId, draft.id);

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Faktur penjualan berhasil dibuat dan diposting ke GL',
      data: posted,
    };
  }

  /**
   * POST /v1/ar/receipts
   * Membuat dan memposting penerimaan pembayaran pelanggan dengan alokasi ke faktur.
   */
  @Post('ar/receipts')
  async createAndPostV1Receipt(@Req() req: any, @Body() body: any) {
    const tenantId = req.tenantId;

    // 1. Idempotency Key
    const headers = req?.headers || {};
    const headerKey =
      (headers['idempotency-key'] as string) ||
      (headers['Idempotency-Key'] as string);
    const resolvedKey = resolveIdempotencyKey(
      body.idempotency_key || body.idempotencyKey,
      headerKey,
    );

    if (resolvedKey) {
      const existing = await this.prisma.customerReceipt.findUnique({
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
          message: 'Penerimaan pembayaran ditemukan dari request sebelumnya (Idempotent Replay)',
          data: existing,
        };
      }
    }

    // 2. Resolusi Partner
    let partnerId = body.partnerId;
    if (!partnerId && (body.partnerKode || body.customer_code)) {
      const p = await this.prisma.businessPartner.findUnique({
        where: { tenantId_kode: { tenantId, kode: body.partnerKode || body.customer_code } },
      });
      if (p) partnerId = p.id;
    }
    if (!partnerId && body.partnerExternalRef) {
      const p = await this.prisma.businessPartner.findUnique({
        where: { tenantId_externalRef: { tenantId, externalRef: body.partnerExternalRef } },
      });
      if (p) partnerId = p.id;
    }
    if (!partnerId) {
      throw new BadRequestException('Pelanggan tidak valid.');
    }

    // 3. Resolusi Akun Kas/Bank
    let akunKasBankId = body.akunKasBankId;
    if (!akunKasBankId && (body.akunKasBankKode || body.account_code)) {
      const acc = await this.prisma.chartOfAccount.findUnique({
        where: {
          tenantId_kode_akun: {
            tenantId,
            kode_akun: body.akunKasBankKode || body.account_code,
          },
        },
      });
      if (acc) akunKasBankId = acc.id;
    }
    if (!akunKasBankId) {
      // Ambil CASH_DEFAULT dari PostingSetup jika tidak ditentukan
      const cashSetup = await this.prisma.postingSetup.findFirst({
        where: { tenantId, key: 'CASH_DEFAULT', groupCode: null },
      });
      if (cashSetup) akunKasBankId = cashSetup.accountId;
    }
    if (!akunKasBankId) {
      throw new BadRequestException(
        'Akun Kas/Bank tidak ditemukan. Tentukan akunKasBankId, akunKasBankKode, atau atur CASH_DEFAULT di Posting Setup.',
      );
    }

    // 4. Resolusi Alokasi Faktur (bisa via invoiceId, noDokumen, atau externalRef)
    const rawAllocs = body.allocations || body.alokasi || [];
    const allocations: any[] = [];

    for (const item of rawAllocs) {
      let invId = item.invoiceId || item.invoice_id;
      if (!invId && (item.noDokumen || item.invoice_no)) {
        const inv = await this.prisma.salesInvoice.findUnique({
          where: {
            tenantId_noDokumen: {
              tenantId,
              noDokumen: item.noDokumen || item.invoice_no,
            },
          },
        });
        if (inv) invId = inv.id;
      }
      if (!invId && (item.externalRef || item.invoice_external_ref)) {
        const inv = await this.prisma.salesInvoice.findFirst({
          where: {
            tenantId,
            externalRef: item.externalRef || item.invoice_external_ref,
          },
        });
        if (inv) invId = inv.id;
      }

      if (invId) {
        allocations.push({
          invoiceId: invId,
          jumlahAlokasi: Number(item.jumlahAlokasi || item.amount || 0),
          kursAlokasi: item.kursAlokasi ? Number(item.kursAlokasi) : undefined,
        });
      }
    }

    const receipt = await this.customerReceiptService.createAndPostReceipt(
      tenantId,
      {
        tanggal: body.tanggal || body.date || new Date().toISOString().slice(0, 10),
        partnerId,
        akunKasBankId,
        jumlah: Number(body.jumlah || body.amount || 0),
        mata_uang: body.mata_uang || body.currency,
        kurs: body.kurs ? Number(body.kurs) : undefined,
        catatan: body.catatan || body.notes,
        externalRef: body.externalRef || body.external_ref,
        idempotencyKey: resolvedKey || undefined,
        allocations,
      },
      req.apiKeyLabel || 'API-V1',
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Penerimaan pembayaran berhasil diposting dan dialokasikan',
      data: receipt,
    };
  }

  /**
   * GET /v1/ar/invoices
   * Mengambil daftar faktur berdasarkan status dan external_ref.
   */
  @Get('ar/invoices')
  async getV1Invoices(
    @Req() req: any,
    @Query('status') status?: SalesInvoiceStatus,
    @Query('external_ref') external_ref?: string,
  ) {
    const tenantId = req.tenantId;
    const data = await this.salesInvoiceService.findAll(tenantId, {
      status,
      externalRef: external_ref,
    });
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /**
   * PUT /v1/partners/:external_ref
   * Upsert master pelanggan via external_ref dari sistem ERP / CRM eksternal.
   */
  @Put('partners/:external_ref')
  async upsertV1Partner(
    @Req() req: any,
    @Param('external_ref') externalRef: string,
    @Body() body: any,
  ) {
    const tenantId = req.tenantId;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    const existing = await this.prisma.businessPartner.findUnique({
      where: {
        tenantId_externalRef: {
          tenantId,
          externalRef,
        },
      },
    });

    const kode =
      body.kode ||
      body.code ||
      existing?.kode ||
      `CUST-${Date.now().toString().slice(-6)}`;

    const dataPayload = {
      nama: body.nama || body.name || existing?.nama || 'Pelanggan Baru',
      npwp: body.npwp !== undefined ? body.npwp : existing?.npwp,
      alamat: body.alamat !== undefined ? body.alamat : existing?.alamat,
      kontak: body.kontak !== undefined ? body.kontak : existing?.kontak,
      termPembayaranHari: body.termPembayaranHari !== undefined ? Number(body.termPembayaranHari) : (existing?.termPembayaranHari || 30),
      creditLimit: body.creditLimit !== undefined ? Number(body.creditLimit) : existing?.creditLimit,
      mata_uang: body.mata_uang || existing?.mata_uang || tenant?.mata_uang || 'IDR',
      isCustomer: true,
      isVendor: body.isVendor !== undefined ? !!body.isVendor : (existing?.isVendor || false),
      groupCode: body.groupCode || existing?.groupCode,
      isActive: body.isActive !== undefined ? !!body.isActive : (existing ? existing.isActive : true),
    };

    const partner = await this.prisma.businessPartner.upsert({
      where: {
        tenantId_externalRef: {
          tenantId,
          externalRef,
        },
      },
      update: dataPayload,
      create: {
        tenantId,
        kode,
        externalRef,
        ...dataPayload,
      },
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Master pelanggan berhasil diperbarui / ditambahkan (Upsert)',
      data: partner,
    };
  }
}

