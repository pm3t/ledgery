import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AssetScanService } from '../services/asset-scan.service';
import {
  CreateVerificationSessionDto,
  ScanItemDto,
  BatchScanVerificationDto,
  ApplyLocationUpdateDto,
  DraftDisposalForNotFoundDto,
} from '../dto/asset-scan.dto';
import { VerificationSessionStatus } from '@prisma/client';

@Controller('fixed-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetScanController {
  constructor(private readonly scanService: AssetScanService) {}

  /**
   * Pembacaan / Scan Cepat dari kode tag (Barcode / QR).
   * Resolusi ketat hanya dalam tenant saat ini.
   * Serializer server-side: untuk peran PETUGAS_ASET, seluruh field finansial dihilangkan.
   */
  @Get('by-tag/:tag_code')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR', 'PETUGAS_ASET')
  async scanTag(
    @Headers('x-tenant-id') tenantId: string,
    @Param('tag_code') tagCode: string,
    @Request() req: any,
  ) {
    const role = req.user?.role;
    return this.scanService.resolveTag(tenantId, tagCode, role);
  }

  @Post(':id/label-installed')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'PETUGAS_ASET')
  async confirmInstalled(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') assetId: string,
    @Request() req: any,
  ) {
    const user = { id: req.user?.id, nama: req.user?.name || req.user?.email };
    return this.scanService.confirmLabelInstalled(tenantId, assetId, user);
  }

  @Post(':id/label-damaged-lost')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'PETUGAS_ASET')
  async reportDamagedLost(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') assetId: string,
    @Body('alasan') alasan: string,
    @Request() req: any,
  ) {
    const user = { id: req.user?.id, nama: req.user?.name || req.user?.email };
    return this.scanService.reportLabelDamagedLost(tenantId, assetId, alasan || 'Label rusak atau hilang', user);
  }

  // =========================================================================
  // SESI VERIFIKASI FISIK
  // =========================================================================

  @Post('verification-sessions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'PETUGAS_ASET')
  async createSession(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreateVerificationSessionDto,
    @Request() req: any,
  ) {
    const user = { id: req.user?.id, nama: req.user?.name || req.user?.email };
    return this.scanService.createVerificationSession(tenantId, dto, user);
  }

  @Get('verification-sessions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR', 'PETUGAS_ASET')
  async listSessions(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: VerificationSessionStatus,
  ) {
    return this.scanService.getVerificationSessions(tenantId, status);
  }

  @Get('verification-sessions/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR', 'PETUGAS_ASET')
  async getSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.scanService.getVerificationSessionById(tenantId, id, req.user?.role);
  }

  @Post('verification-sessions/:id/scan')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'PETUGAS_ASET')
  async scanInSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') sessionId: string,
    @Body() dto: ScanItemDto,
    @Request() req: any,
  ) {
    const user = {
      id: req.user?.id,
      nama: req.user?.name || req.user?.email,
      role: req.user?.role,
    };
    return this.scanService.scanInSession(tenantId, sessionId, dto, user);
  }

  @Post('verification-sessions/:id/batch-scan')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'PETUGAS_ASET')
  async batchScanInSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') sessionId: string,
    @Body() dto: BatchScanVerificationDto,
    @Request() req: any,
  ) {
    const user = {
      id: req.user?.id,
      nama: req.user?.name || req.user?.email,
      role: req.user?.role,
    };
    return this.scanService.batchScanInSession(tenantId, sessionId, dto, user);
  }

  @Post('verification-sessions/:id/close')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'PETUGAS_ASET')
  async closeSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') sessionId: string,
    @Request() req: any,
  ) {
    const user = { id: req.user?.id, nama: req.user?.name || req.user?.email };
    return this.scanService.closeVerificationSession(tenantId, sessionId, user);
  }

  @Post('verification-sessions/:id/reopen')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async reopenSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') sessionId: string,
    @Request() req: any,
  ) {
    const user = {
      id: req.user?.id,
      nama: req.user?.name || req.user?.email,
      role: req.user?.role,
    };
    return this.scanService.reopenVerificationSession(tenantId, sessionId, user);
  }

  @Post('verification-sessions/:id/apply-location-updates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async applyLocationUpdates(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') sessionId: string,
    @Body() dto: ApplyLocationUpdateDto,
    @Request() req: any,
  ) {
    const user = { id: req.user?.id, nama: req.user?.name || req.user?.email };
    return this.scanService.applyLocationUpdates(tenantId, sessionId, dto, user);
  }

  @Post('verification-sessions/:id/draft-disposal')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async draftDisposal(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') sessionId: string,
    @Body() dto: DraftDisposalForNotFoundDto,
    @Request() req: any,
  ) {
    const user = { id: req.user?.id, nama: req.user?.name || req.user?.email };
    return this.scanService.createDraftDisposalForNotFound(tenantId, sessionId, dto, user);
  }
}
