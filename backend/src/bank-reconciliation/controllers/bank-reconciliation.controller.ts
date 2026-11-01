import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UserRole, BankMatchStatus } from '@prisma/client';
import { BankReconciliationService } from '../services/bank-reconciliation.service';
import {
  SaveBankImportTemplateDto,
  ImportStatementLinesDto,
  ManualMatchDto,
  BatchAcceptMatchesDto,
  IgnoreStatementLineDto,
  CreateAdjustmentDocDto,
  CompleteReconciliationDto,
  ReopenReconciliationDto,
} from '../dto/bank-reconciliation.dto';
import * as xlsx from 'xlsx';

@Controller('bank-reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BankReconciliationController {
  constructor(private readonly reconService: BankReconciliationService) {}

  @Get('templates/:accountId')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async getTemplate(@Req() req: any, @Param('accountId') accountId: string) {
    const tenantId = req.user.tenantId;
    return this.reconService.getTemplate(tenantId, accountId);
  }

  @Post('templates')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async saveTemplate(@Req() req: any, @Body() dto: SaveBankImportTemplateDto) {
    const tenantId = req.user.tenantId;
    return this.reconService.saveTemplate(tenantId, dto);
  }

  @Post('upload-statement')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  @UseInterceptors(FileInterceptor('file'))
  async uploadStatement(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body('cashBankAccountId') cashBankAccountId: string,
    @Body('templateConfig') templateConfigStr?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File mutasi rekening koran wajib diunggah.');
    }
    if (!cashBankAccountId) {
      throw new BadRequestException('ID rekening kas/bank wajib diisi.');
    }

    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    let templateConfig;
    if (templateConfigStr) {
      try {
        templateConfig = JSON.parse(templateConfigStr);
      } catch (e) {
        throw new BadRequestException('Format templateConfig tidak valid JSON.');
      }
    }

    return this.reconService.importStatementFile(
      tenantId,
      userId,
      cashBankAccountId,
      file.buffer,
      file.originalname,
      templateConfig,
    );
  }

  @Post('import-lines')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async importLines(@Req() req: any, @Body() dto: ImportStatementLinesDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    // Format JSON lines menggunakan helper parsing file yang sama atau mapper
    // Konversi lines ke bentuk file buffer atau import langsung
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(dto.lines);
    xlsx.utils.book_append_sheet(wb, ws, 'Statement');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return this.reconService.importStatementFile(
      tenantId,
      userId,
      dto.cashBankAccountId,
      buf,
      dto.namaFile,
      {
        pemetaanKolom: {
          tanggalCol: 0,
          keteranganCol: 1,
          referensiCol: 2,
          debitCol: 3,
          kreditCol: 4,
          saldoCol: 5,
          startRow: 1,
        },
      },
    );
  }

  @Get('statement-lines/:accountId')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async getStatementLines(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Query('matchStatus') matchStatus?: BankMatchStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reconService.getStatementLines(tenantId, accountId, {
      matchStatus,
      startDate,
      endDate,
    });
  }

  @Get('book-entries/:accountId')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async getBookEntries(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Query('tanggalAkhir') tanggalAkhir?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reconService.getBookEntriesForRecon(tenantId, accountId, tanggalAkhir);
  }

  @Get('auto-match-recommendations/:accountId')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async getAutoMatchRecommendations(
    @Req() req: any,
    @Param('accountId') accountId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reconService.getAutoMatchRecommendations(tenantId, accountId);
  }

  @Post('batch-accept-matches')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async batchAcceptMatches(@Req() req: any, @Body() dto: BatchAcceptMatchesDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.reconService.batchAcceptMatches(tenantId, userId, dto);
  }

  @Post('manual-match')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async manualMatch(@Req() req: any, @Body() dto: ManualMatchDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.reconService.manualMatch(tenantId, userId, dto);
  }

  @Post('unmatch/:statementLineId')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async unmatch(@Req() req: any, @Param('statementLineId') statementLineId: string) {
    const tenantId = req.user.tenantId;
    return this.reconService.unmatch(tenantId, statementLineId);
  }

  @Post('ignore-line/:statementLineId')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async ignoreLine(
    @Req() req: any,
    @Param('statementLineId') statementLineId: string,
    @Body() dto: IgnoreStatementLineDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.reconService.ignoreStatementLine(tenantId, statementLineId, dto.reason);
  }

  @Post('unignore-line/:statementLineId')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async unignoreLine(
    @Req() req: any,
    @Param('statementLineId') statementLineId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reconService.unignoreStatementLine(tenantId, statementLineId);
  }

  @Post('adjustment-doc')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async createAdjustmentDoc(
    @Req() req: any,
    @Body() dto: CreateAdjustmentDocDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.reconService.createAdjustmentDoc(tenantId, userId, dto);
  }

  @Get('summary/:accountId')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async getSummary(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Query('tanggalAkhir') tanggalAkhir: string,
    @Query('saldoRekeningKoran') saldoRekeningKoran?: string,
  ) {
    if (!tanggalAkhir) {
      throw new BadRequestException('Query tanggalAkhir wajib diisi.');
    }
    const tenantId = req.user.tenantId;
    const saldoKoran = saldoRekeningKoran !== undefined ? parseFloat(saldoRekeningKoran) : undefined;
    return this.reconService.calculateReconciliationSummary(
      tenantId,
      accountId,
      tanggalAkhir,
      saldoKoran,
    );
  }

  @Post('complete')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async complete(@Req() req: any, @Body() dto: CompleteReconciliationDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.reconService.completeReconciliation(tenantId, userId, dto);
  }

  @Post('reopen/:id')
  @Roles(UserRole.ADMIN_TENANT)
  async reopen(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReopenReconciliationDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.reconService.reopenReconciliation(tenantId, userId, id, dto);
  }

  @Get('history')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async getHistory(
    @Req() req: any,
    @Query('cashBankAccountId') cashBankAccountId?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reconService.getReconciliationHistory(tenantId, cashBankAccountId);
  }

  @Get('detail/:id')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async getDetail(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.reconService.getReconciliationDetail(tenantId, id);
  }
}
