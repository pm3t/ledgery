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
import { PurchaseBillService } from './purchase-bill.service';
import { VendorPaymentService } from './vendor-payment.service';
import { DebitNoteService } from './debit-note.service';
import { ApReportService } from './ap-report.service';
import { ApOpeningBalanceService } from './ap-opening-balance.service';
import {
  CreatePurchaseBillDto,
  UpdatePurchaseBillDto,
} from './dto/purchase-bill.dto';
import { CreateVendorPaymentDto } from './dto/vendor-payment.dto';
import { CreateDebitNoteDto } from './dto/debit-note.dto';
import { ApOpeningBalanceImportDto } from './dto/opening-balance.dto';
import { PurchaseBillStatus, VendorPaymentStatus } from '@prisma/client';

@Controller('ap')
@UseGuards(JwtAuthGuard)
export class AccountsPayableController {
  constructor(
    private readonly purchaseBillService: PurchaseBillService,
    private readonly vendorPaymentService: VendorPaymentService,
    private readonly debitNoteService: DebitNoteService,
    private readonly apReportService: ApReportService,
    private readonly apOpeningBalanceService: ApOpeningBalanceService,
  ) {}

  // ==========================================
  // PURCHASE BILLS (FAKTUR PEMBELIAN)
  // ==========================================

  @Get('bills/:tenantId')
  async getBills(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: PurchaseBillStatus,
    @Query('partnerId') partnerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('externalRef') externalRef?: string,
  ) {
    const data = await this.purchaseBillService.findAllBills(tenantId, {
      status,
      partnerId,
      startDate,
      endDate,
      externalRef,
    });
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('bills/:tenantId/outstanding')
  async getOutstandingBills(
    @Param('tenantId') tenantId: string,
    @Query('partnerId') partnerId?: string,
  ) {
    const data = await this.purchaseBillService.findOutstandingBills(tenantId, partnerId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('bills/:tenantId/:id')
  async getBillDetail(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.purchaseBillService.getBillById(tenantId, id);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('bills/:tenantId')
  async createDraftBill(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreatePurchaseBillDto,
    @Req() req: any,
  ) {
    const userName = req.user?.nama || req.user?.email || 'Dashboard User';
    const data = await this.purchaseBillService.createDraft(tenantId, dto, userName);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Draft faktur pembelian berhasil dibuat',
      data,
    };
  }

  @Put('bills/:tenantId/:id')
  async updateDraftBill(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseBillDto,
  ) {
    const data = await this.purchaseBillService.updateDraft(tenantId, id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Draft faktur pembelian berhasil diperbarui',
      data,
    };
  }

  @Delete('bills/:tenantId/:id')
  async deleteDraftBill(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.purchaseBillService.deleteDraft(tenantId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Draft faktur pembelian berhasil dihapus',
    };
  }

  @Post('bills/:tenantId/:id/post')
  async postBill(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.purchaseBillService.postBill(tenantId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Faktur pembelian berhasil diposting ke General Ledger',
      data,
    };
  }

  @Post('bills/:tenantId/:id/void')
  async voidBill(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan?: string,
  ) {
    const data = await this.purchaseBillService.voidBill(
      tenantId,
      id,
      alasan || 'Pembatalan faktur pembelian via dashboard',
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Faktur pembelian berhasil di-void dan jurnal pembalik telah dibuat',
      data,
    };
  }

  // ==========================================
  // VENDOR PAYMENTS (PEMBAYARAN VENDOR)
  // ==========================================

  @Get('payments/:tenantId')
  async getPayments(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: VendorPaymentStatus,
    @Query('partnerId') partnerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.vendorPaymentService.findAllPayments(tenantId, {
      status,
      partnerId,
      startDate,
      endDate,
    });
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('payments/:tenantId/:id')
  async getPaymentDetail(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.vendorPaymentService.getPaymentById(tenantId, id);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('payments/:tenantId')
  async createPayment(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateVendorPaymentDto,
    @Req() req: any,
  ) {
    const userName = req.user?.nama || req.user?.email || 'Dashboard User';
    const data = await this.vendorPaymentService.createAndPostPayment(tenantId, dto, userName);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Pembayaran vendor berhasil diposting dan dialokasikan',
      data,
    };
  }

  @Post('payments/:tenantId/:id/void')
  async voidPayment(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan?: string,
  ) {
    const data = await this.vendorPaymentService.voidPayment(
      tenantId,
      id,
      alasan || 'Pembatalan pembayaran vendor via dashboard',
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Pembayaran vendor berhasil di-void dan saldo tagihan telah dipulihkan',
      data,
    };
  }

  // ==========================================
  // DEBIT NOTES (NOTA DEBIT)
  // ==========================================

  @Get('debit-notes/:tenantId')
  async getDebitNotes(
    @Param('tenantId') tenantId: string,
    @Query('partnerId') partnerId?: string,
  ) {
    const data = await this.debitNoteService.findAllDebitNotes(tenantId, partnerId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('debit-notes/:tenantId')
  async createDebitNote(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateDebitNoteDto,
    @Req() req: any,
  ) {
    const userName = req.user?.nama || req.user?.email || 'Dashboard User';
    const data = await this.debitNoteService.createAndPostDebitNote(tenantId, dto, userName);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Nota debit berhasil diposting ke General Ledger',
      data,
    };
  }

  @Post('debit-notes/:tenantId/:id/void')
  async voidDebitNote(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan?: string,
  ) {
    const data = await this.debitNoteService.voidDebitNote(
      tenantId,
      id,
      alasan || 'Pembatalan nota debit via dashboard',
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Nota debit berhasil di-void',
      data,
    };
  }

  // ==========================================
  // LAPORAN AP (AGING, KARTU HUTANG, JADWAL PEMBAYARAN)
  // ==========================================

  @Get('reports/aging/:tenantId')
  async getAgingReport(
    @Param('tenantId') tenantId: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const data = await this.apReportService.getAgingReport(tenantId, asOfDate);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('reports/vendor-ledger/:tenantId/:partnerId')
  async getVendorLedger(
    @Param('tenantId') tenantId: string,
    @Param('partnerId') partnerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.apReportService.getVendorLedger(
      tenantId,
      partnerId,
      startDate,
      endDate,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('reports/payment-schedule/:tenantId')
  async getPaymentSchedule(
    @Param('tenantId') tenantId: string,
    @Query('daysAhead') daysAhead?: string,
    @Query('partnerId') partnerId?: string,
  ) {
    const days = daysAhead ? parseInt(daysAhead, 10) : 30;
    const data = await this.apReportService.getPaymentSchedule(
      tenantId,
      isNaN(days) ? 30 : days,
      partnerId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  // ==========================================
  // SALDO AWAL HUTANG (OPENING BALANCE IMPORT)
  // ==========================================

  @Post('opening-balance/:tenantId/import')
  async importOpeningBalance(
    @Param('tenantId') tenantId: string,
    @Body() dto: ApOpeningBalanceImportDto,
  ) {
    const data = await this.apOpeningBalanceService.importOpeningBalance(tenantId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: data.message,
      data,
    };
  }
}

