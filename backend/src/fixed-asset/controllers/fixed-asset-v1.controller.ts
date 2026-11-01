import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../../api-v1/integration-log.interceptor';
import { V1ExceptionFilter } from '../../api-v1/v1-exception.filter';
import { FixedAssetV1Service } from '../services/fixed-asset-v1.service';
import { AssetScanService } from '../services/asset-scan.service';
import { UpsertFixedAssetV1Dto } from '../dto/fixed-asset.dto';
import { CreateVerificationSessionDto, BatchScanVerificationDto } from '../dto/asset-scan.dto';
import { FixedAssetStatus } from '@prisma/client';

@Controller('v1/fixed-assets')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class FixedAssetV1Controller {
  constructor(
    private readonly assetV1Service: FixedAssetV1Service,
    private readonly assetScanService: AssetScanService,
  ) {}

  @Put(':external_ref')
  async upsertAsset(
    @Req() req: any,
    @Param('external_ref') externalRef: string,
    @Body() dto: UpsertFixedAssetV1Dto,
  ) {
    const tenantId = req.apiKey.tenantId;
    return this.assetV1Service.upsertAsset(tenantId, externalRef, dto);
  }

  @Get()
  async getAssets(
    @Req() req: any,
    @Query('status') status?: FixedAssetStatus,
    @Query('external_ref') externalRef?: string,
  ) {
    const tenantId = req.apiKey.tenantId;
    return this.assetV1Service.getAssets(tenantId, {
      status,
      external_ref: externalRef,
    });
  }

  @Get('categories')
  async getCategories(@Req() req: any) {
    const tenantId = req.apiKey.tenantId;
    return this.assetV1Service.getCategories(tenantId);
  }

  @Get(':ref')
  async getAssetByRef(@Req() req: any, @Param('ref') ref: string) {
    const tenantId = req.apiKey.tenantId;
    return this.assetV1Service.getAssetByRef(tenantId, ref);
  }

  @Get(':ref/schedule')
  async getAssetScheduleByRef(@Req() req: any, @Param('ref') ref: string) {
    const tenantId = req.apiKey.tenantId;
    return this.assetV1Service.getAssetScheduleByRef(tenantId, ref);
  }

  @Post(':ref/capitalize')
  async capitalizeByRef(
    @Req() req: any,
    @Param('ref') ref: string,
    @Body() payload: { category_id: string; tanggal_mulai_digunakan: string; tanggal?: string },
  ) {
    const tenantId = req.apiKey.tenantId;
    return this.assetV1Service.capitalizeByRef(tenantId, ref, payload);
  }

  /**
   * GET /v1/fixed-assets/by-tag/:tag_code
   * Resolusi kode tag dari barcode / QR via API publik.
   */
  @Get('by-tag/:tag_code')
  async getByTag(
    @Req() req: any,
    @Param('tag_code') tagCode: string,
  ) {
    const tenantId = req.apiKey.tenantId;
    return this.assetScanService.resolveTag(tenantId, tagCode);
  }

  /**
   * POST /v1/fixed-assets/verification-sessions
   * Membuat sesi verifikasi fisik aset via API integrasi.
   */
  @Post('verification-sessions')
  async createVerificationSession(
    @Req() req: any,
    @Body() dto: CreateVerificationSessionDto,
  ) {
    const tenantId = req.apiKey.tenantId;
    const user = { id: req.apiKey.id || 'API', nama: req.apiKey.name || 'API Client' };
    return this.assetScanService.createVerificationSession(tenantId, dto, user);
  }

  /**
   * POST /v1/fixed-assets/verification-sessions/:id/scans
   * Mengunggah pemindaian hasil stock opname aset secara batch.
   */
  @Post('verification-sessions/:id/scans')
  async batchScans(
    @Req() req: any,
    @Param('id') sessionId: string,
    @Body() dto: BatchScanVerificationDto,
  ) {
    const tenantId = req.apiKey.tenantId;
    const user = { id: req.apiKey.id || 'API', nama: req.apiKey.name || 'API Client' };
    return this.scanServiceBatch(tenantId, sessionId, dto, user);
  }

  private async scanServiceBatch(tenantId: string, sessionId: string, dto: any, user: any) {
    // Dukung payload array langsung atau object { scans: [...] }
    const scans = Array.isArray(dto) ? { scans: dto } : dto;
    return this.assetScanService.batchScanInSession(tenantId, sessionId, scans, user);
  }

  /**
   * GET /v1/fixed-assets/verification-sessions/:id
   * Mengambil hasil dan ringkasan selisih sesi verifikasi fisik.
   */
  @Get('verification-sessions/:id')
  async getVerificationSession(
    @Req() req: any,
    @Param('id') sessionId: string,
  ) {
    const tenantId = req.apiKey.tenantId;
    return this.assetScanService.getVerificationSessionById(tenantId, sessionId);
  }
}

