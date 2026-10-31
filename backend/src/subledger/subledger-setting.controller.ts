import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { SubledgerSettingService } from './subledger-setting.service';
import { SubledgerReconciliationService } from './subledger-reconciliation.service';
import {
  UpdateSubledgerSettingDto,
  UpsertPostingSetupItemDto,
  BatchUpsertPostingSetupDto,
} from './dto/subledger-setting.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('subledger')
@UseGuards(JwtAuthGuard)
export class SubledgerSettingController {
  constructor(
    private readonly subledgerSettingService: SubledgerSettingService,
    private readonly reconciliationService: SubledgerReconciliationService,
  ) {}

  @Get('reconciliation/:tenantId')
  async getReconciliationByTenant(
    @Param('tenantId') tenantId: string,
    @Query('tanggal') tanggal?: string,
  ) {
    const data = await this.reconciliationService.getReconciliation(tenantId, tanggal);
    return {
      statusCode: HttpStatus.OK,
      message: 'Data rekonsiliasi subledger vs GL berhasil dihitung',
      data,
    };
  }

  @Get('reconciliation')
  async getReconciliation(
    @Request() req: any,
    @Query('tenantId') queryTenantId?: string,
    @Query('tanggal') tanggal?: string,
  ) {
    const tenantId = queryTenantId || req.user?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId diperlukan untuk audit rekonsiliasi');
    }
    const data = await this.reconciliationService.getReconciliation(tenantId, tanggal);
    return {
      statusCode: HttpStatus.OK,
      message: 'Data rekonsiliasi subledger vs GL berhasil dihitung',
      data,
    };
  }

  @Get('dashboard-summary/:tenantId')
  async getDashboardSummaryByTenant(@Param('tenantId') tenantId: string) {
    const data = await this.reconciliationService.getDashboardSummary(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Ringkasan dashboard staf akuntansi berhasil dihitung',
      data,
    };
  }

  @Get('dashboard-summary')
  async getDashboardSummary(
    @Request() req: any,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = queryTenantId || req.user?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId diperlukan untuk ringkasan dashboard');
    }
    const data = await this.reconciliationService.getDashboardSummary(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Ringkasan dashboard staf akuntansi berhasil dihitung',
      data,
    };
  }

  @Get('settings/:tenantId')
  async getSettings(@Param('tenantId') tenantId: string) {
    const data = await this.subledgerSettingService.getSettings(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Pengaturan subledger berhasil diambil',
      data,
    };
  }

  @Put('settings/:tenantId')
  async updateSettings(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateSubledgerSettingDto,
  ) {
    const data = await this.subledgerSettingService.updateSettings(
      tenantId,
      dto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Pengaturan subledger berhasil diperbarui',
      data,
    };
  }

  @Get('posting-setup/:tenantId')
  async getPostingSetups(@Param('tenantId') tenantId: string) {
    const data =
      await this.subledgerSettingService.getPostingSetups(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar pemetaan akun posting subledger berhasil diambil',
      data,
    };
  }

  @Post('posting-setup/:tenantId')
  async upsertPostingSetup(
    @Param('tenantId') tenantId: string,
    @Body() body: UpsertPostingSetupItemDto | BatchUpsertPostingSetupDto,
  ) {
    if ('items' in body && Array.isArray(body.items)) {
      const data =
        await this.subledgerSettingService.batchUpsertPostingSetups(
          tenantId,
          body.items,
        );
      return {
        statusCode: HttpStatus.OK,
        message: 'Pemetaan akun posting subledger berhasil disimpan',
        data,
      };
    } else {
      const data = await this.subledgerSettingService.upsertPostingSetup(
        tenantId,
        body as UpsertPostingSetupItemDto,
      );
      return {
        statusCode: HttpStatus.OK,
        message: 'Pemetaan akun posting subledger berhasil disimpan',
        data,
      };
    }
  }

  @Get('activation-check/:tenantId')
  async checkActivation(@Param('tenantId') tenantId: string) {
    const data =
      await this.subledgerSettingService.checkControlAccountBalances(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Pemeriksaan saldo akun kontrol berhasil dihitung',
      data,
    };
  }
}

