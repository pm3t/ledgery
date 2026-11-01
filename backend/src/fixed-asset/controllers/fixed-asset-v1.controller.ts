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
import { UpsertFixedAssetV1Dto } from '../dto/fixed-asset.dto';
import { FixedAssetStatus } from '@prisma/client';

@Controller('v1/fixed-assets')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class FixedAssetV1Controller {
  constructor(private readonly assetV1Service: FixedAssetV1Service) {}

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
}

