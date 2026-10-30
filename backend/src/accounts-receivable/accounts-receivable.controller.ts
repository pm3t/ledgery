import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SalesInvoiceService } from './sales-invoice.service';
import { CustomerReceiptService } from './customer-receipt.service';
import { CreditNoteService } from './credit-note.service';
import { ArReportService } from './ar-report.service';
import { ArOpeningBalanceService } from './ar-opening-balance.service';
import {
  CreateSalesInvoiceDto,
  UpdateSalesInvoiceDto,
} from './dto/sales-invoice.dto';
import { CreateCustomerReceiptDto } from './dto/customer-receipt.dto';
import { CreateCreditNoteDto } from './dto/credit-note.dto';
import { OpeningBalanceImportDto } from './dto/opening-balance.dto';
import { SalesInvoiceStatus } from '@prisma/client';

@Controller('ar')
@UseGuards(JwtAuthGuard)
export class AccountsReceivableController {
  constructor(
    private readonly salesInvoiceService: SalesInvoiceService,
    private readonly customerReceiptService: CustomerReceiptService,
    private readonly creditNoteService: CreditNoteService,
    private readonly arReportService: ArReportService,
    private readonly arOpeningBalanceService: ArOpeningBalanceService,
  ) {}

  // ==========================================
  // SALES INVOICES (FAKTUR PENJUALAN)
  // ==========================================

  @Get('invoices/:tenantId')
  async getInvoices(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: SalesInvoiceStatus,
    @Query('partnerId') partnerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('externalRef') externalRef?: string,
  ) {
    const data = await this.salesInvoiceService.findAll(tenantId, {
      status,
      partnerId,
      startDate,
      endDate,
      search,
      externalRef,
    });
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('invoices/:tenantId/outstanding')
  async getOutstandingInvoices(
    @Param('tenantId') tenantId: string,
    @Query('partnerId') partnerId?: string,
  ) {
    const data = await this.salesInvoiceService.getOutstanding(tenantId, partnerId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('invoices/:tenantId/:id')
  async getInvoiceDetail(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.salesInvoiceService.findOne(tenantId, id);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('invoices/:tenantId')
  async createDraftInvoice(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateSalesInvoiceDto,
    @Req() req: any,
  ) {
    const userName = req.user?.nama || req.user?.email || 'Dashboard User';
    const data = await this.salesInvoiceService.createDraft(tenantId, dto, userName);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Draft faktur penjualan berhasil dibuat',
      data,
    };
  }

  @Put('invoices/:tenantId/:id')
  async updateDraftInvoice(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSalesInvoiceDto,
  ) {
    const data = await this.salesInvoiceService.updateDraft(tenantId, id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Draft faktur penjualan berhasil diperbarui',
      data,
    };
  }

  @Delete('invoices/:tenantId/:id')
  async deleteDraftInvoice(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.salesInvoiceService.deleteDraft(tenantId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Draft faktur penjualan berhasil dihapus',
    };
  }

  @Post('invoices/:tenantId/:id/post')
  async postInvoice(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.salesInvoiceService.postInvoice(tenantId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Faktur penjualan berhasil diposting ke General Ledger',
      data,
    };
  }

  @Post('invoices/:tenantId/:id/void')
  async voidInvoice(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan?: string,
  ) {
    const data = await this.salesInvoiceService.voidInvoice(tenantId, id, alasan);
    return {
      statusCode: HttpStatus.OK,
      message: 'Faktur penjualan berhasil di-void dan jurnal pembalik telah dibuat',
      data,
    };
  }

  // ==========================================
  // CUSTOMER RECEIPTS (PENERIMAAN PEMBAYARAN)
  // ==========================================

  @Get('receipts/:tenantId')
  async getReceipts(
    @Param('tenantId') tenantId: string,
    @Query('partnerId') partnerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.customerReceiptService.findAll(tenantId, {
      partnerId,
      startDate,
      endDate,
      search,
    });
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('receipts/:tenantId/:id')
  async getReceiptDetail(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.customerReceiptService.findOne(tenantId, id);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('receipts/:tenantId')
  async createReceipt(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCustomerReceiptDto,
    @Req() req: any,
  ) {
    const userName = req.user?.nama || req.user?.email || 'Dashboard User';
    const data = await this.customerReceiptService.createAndPostReceipt(tenantId, dto, userName);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Penerimaan pembayaran berhasil diposting dan dialokasikan',
      data,
    };
  }

  @Post('receipts/:tenantId/:id/void')
  async voidReceipt(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan?: string,
  ) {
    const data = await this.customerReceiptService.voidReceipt(tenantId, id, alasan);
    return {
      statusCode: HttpStatus.OK,
      message: 'Penerimaan pembayaran berhasil di-void dan saldo faktur telah dipulihkan',
      data,
    };
  }

  // ==========================================
  // CREDIT NOTES (NOTA KREDIT)
  // ==========================================

  @Get('credit-notes/:tenantId')
  async getCreditNotes(
    @Param('tenantId') tenantId: string,
    @Query('partnerId') partnerId?: string,
  ) {
    const data = await this.creditNoteService.findAll(tenantId, partnerId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('credit-notes/:tenantId')
  async createCreditNote(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCreditNoteDto,
    @Req() req: any,
  ) {
    const userName = req.user?.nama || req.user?.email || 'Dashboard User';
    const data = await this.creditNoteService.createAndPostCreditNote(tenantId, dto, userName);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Nota kredit berhasil diposting ke General Ledger',
      data,
    };
  }

  @Post('credit-notes/:tenantId/:id/void')
  async voidCreditNote(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan?: string,
  ) {
    const data = await this.creditNoteService.voidCreditNote(tenantId, id, alasan);
    return {
      statusCode: HttpStatus.OK,
      message: 'Nota kredit berhasil di-void',
      data,
    };
  }

  // ==========================================
  // LAPORAN AR (AGING & KARTU PIUTANG)
  // ==========================================

  @Get('reports/aging/:tenantId')
  async getAgingReport(
    @Param('tenantId') tenantId: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const data = await this.arReportService.getAgingReport(tenantId, asOfDate);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('reports/customer-ledger/:tenantId/:partnerId')
  async getCustomerLedger(
    @Param('tenantId') tenantId: string,
    @Param('partnerId') partnerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.arReportService.getCustomerLedger(
      tenantId,
      partnerId,
      startDate,
      endDate,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  // ==========================================
  // SALDO AWAL PIUTANG (OPENING BALANCE IMPORT)
  // ==========================================

  @Post('opening-balance/:tenantId/import')
  async importOpeningBalance(
    @Param('tenantId') tenantId: string,
    @Body() dto: OpeningBalanceImportDto,
  ) {
    const data = await this.arOpeningBalanceService.importOpeningBalance(tenantId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: data.message,
      data,
    };
  }
}

