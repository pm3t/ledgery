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
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UserRole, CashTransferVariant } from '@prisma/client';
import { CashBankAccountService } from '../services/cash-bank-account.service';
import { CashDocumentService } from '../services/cash-document.service';
import { CashOpeningBalanceService } from '../services/cash-opening-balance.service';
import {
  CreateCashBankAccountDto,
  UpdateCashBankAccountDto,
} from '../dto/cash-bank-account.dto';
import { CreateCashReceiptDto } from '../dto/cash-receipt.dto';
import { CreateCashDisbursementDto } from '../dto/cash-disbursement.dto';
import { CreateCashTransferDto } from '../dto/cash-transfer.dto';
import { ImportCashOpeningBalanceDto } from '../dto/cash-opening-balance.dto';

/**
 * Controller utama untuk sub ledger Kas & Bank (internal dashboard).
 * Semua endpoint membutuhkan autentikasi JWT dan RolesGuard.
 */
@Controller('cash-bank')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashBankController {
  constructor(
    private readonly accountService: CashBankAccountService,
    private readonly docService: CashDocumentService,
    private readonly openingService: CashOpeningBalanceService,
  ) {}

  // =========================================================================
  // 1. MASTER REKENING KAS & BANK
  // =========================================================================

  @Get('accounts')
  async getAccounts(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.accountService.findAll(tenantId);
  }

  @Get('accounts/:id')
  async getAccountById(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.findOne(tenantId, id);
  }

  @Post('accounts')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  async createAccount(@Request() req: any, @Body() dto: CreateCashBankAccountDto) {
    const tenantId = req.user.tenantId;
    return this.accountService.create(tenantId, dto);
  }

  @Put('accounts/:id')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  async updateAccount(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCashBankAccountDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.update(tenantId, id, dto);
  }

  @Delete('accounts/:id')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  async deactivateAccount(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.update(tenantId, id, { isActive: false });
  }

  @Get('accounts/:id/balance')
  async getAccountBalance(
    @Request() req: any,
    @Param('id') id: string,
    @Query('tanggal') tanggal?: string,
  ) {
    return this.accountService.getBalance(id, tanggal);
  }

  // =========================================================================
  // 2. PENERIMAAN KAS/BANK (CASH RECEIPT)
  // =========================================================================

  @Get('receipts')
  async getReceipts(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.docService.findAllReceipts(tenantId);
  }

  @Get('receipts/:id')
  async getReceiptById(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.docService.findReceiptById(tenantId, id);
  }

  @Post('receipts')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI, UserRole.SUPER_ADMIN)
  async createReceipt(@Request() req: any, @Body() dto: CreateCashReceiptDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id || req.user.sub;
    return this.docService.createReceiptDraft(tenantId, dto, userId);
  }

  @Post('receipts/:id/post')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async postReceipt(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.docService.postReceipt(tenantId, id);
  }

  @Post('receipts/:id/void')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async voidReceipt(
    @Request() req: any,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.docService.voidReceipt(tenantId, id, reason);
  }

  // =========================================================================
  // 3. PENGELUARAN KAS/BANK & VOUCHER KAS KECIL (CASH DISBURSEMENT)
  // =========================================================================

  @Get('disbursements')
  async getDisbursements(
    @Request() req: any,
    @Query('docVariant') docVariant?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.docService.findAllDisbursements(tenantId, docVariant);
  }

  @Get('disbursements/replenishment-suggestion')
  async getReplenishmentSuggestion(
    @Request() req: any,
    @Query('accountId') accountId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.docService.getPettyCashReplenishmentSuggestion(tenantId, accountId);
  }

  @Get('disbursements/:id')
  async getDisbursementById(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.docService.findDisbursementById(tenantId, id);
  }

  @Post('disbursements')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI, UserRole.SUPER_ADMIN)
  async createDisbursement(@Request() req: any, @Body() dto: CreateCashDisbursementDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id || req.user.sub;
    return this.docService.createDisbursementDraft(tenantId, dto, userId);
  }

  @Post('disbursements/:id/post')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async postDisbursement(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.docService.postDisbursement(tenantId, id);
  }

  @Post('disbursements/:id/void')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async voidDisbursement(
    @Request() req: any,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.docService.voidDisbursement(tenantId, id, reason);
  }

  // =========================================================================
  // 4. TRANSFER KAS/BANK & PENGISIAN KAS KECIL (CASH TRANSFER)
  // =========================================================================

  @Get('transfers')
  async getTransfers(
    @Request() req: any,
    @Query('variant') variant?: CashTransferVariant,
  ) {
    const tenantId = req.user.tenantId;
    return this.docService.findAllTransfers(tenantId, variant);
  }

  @Get('transfers/:id')
  async getTransferById(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.docService.findTransferById(tenantId, id);
  }

  @Post('transfers')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI, UserRole.SUPER_ADMIN)
  async createTransfer(@Request() req: any, @Body() dto: CreateCashTransferDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id || req.user.sub;
    return this.docService.createTransferDraft(tenantId, dto, userId);
  }

  @Post('transfers/:id/post')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async postTransfer(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.docService.postTransfer(tenantId, id);
  }

  @Post('transfers/:id/void')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async voidTransfer(
    @Request() req: any,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.docService.voidTransfer(tenantId, id, reason);
  }

  // =========================================================================
  // 5. IMPORT SALDO AWAL (CUT-OFF)
  // =========================================================================

  @Get('opening-balance/status')
  async getOpeningBalanceStatus(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.openingService.getOpeningBalanceStatus(tenantId);
  }

  @Post('opening-balance')
  @Roles(UserRole.ADMIN_TENANT, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async importOpeningBalance(
    @Request() req: any,
    @Body() dto: ImportCashOpeningBalanceDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.openingService.importOpeningBalance(tenantId, dto);
  }
}
