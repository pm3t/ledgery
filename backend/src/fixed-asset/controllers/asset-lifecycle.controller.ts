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
import { AssetLifecycleService } from '../services/asset-lifecycle.service';
import {
  TransferAssetDto,
  MassTransferDto,
  ImpairAssetDto,
  DisposeAssetDto,
} from '../dto/fixed-asset.dto';

@Controller('fixed-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetLifecycleController {
  constructor(private readonly lifecycleService: AssetLifecycleService) {}

  @Post(':id/transfer')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async transferAsset(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') assetId: string,
    @Body() dto: TransferAssetDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.nama || 'User';
    return this.lifecycleService.transferAsset(tenantId, assetId, dto, userId);
  }

  @Post('mass-transfer')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async massTransfer(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: MassTransferDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.nama || 'User';
    return this.lifecycleService.massTransfer(tenantId, dto, userId);
  }

  @Post(':id/impairment')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async impairAsset(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') assetId: string,
    @Body() dto: ImpairAssetDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.nama || 'User';
    return this.lifecycleService.impairAsset(tenantId, assetId, dto, userId);
  }

  @Post(':id/dispose')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async disposeAsset(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') assetId: string,
    @Body() dto: DisposeAssetDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.nama || 'User';
    return this.lifecycleService.disposeAsset(tenantId, assetId, dto, userId);
  }

  @Post('disposals/:id/void')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async voidDisposal(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') disposalId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.nama || 'User';
    return this.lifecycleService.voidDisposal(tenantId, disposalId, userId);
  }

  @Post('impairments/:id/void')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async voidImpairment(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') impairmentId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.nama || 'User';
    return this.lifecycleService.voidImpairment(tenantId, impairmentId, userId);
  }

  @Get('events')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR')
  async getEvents(
    @Headers('x-tenant-id') tenantId: string,
    @Query('assetId') assetId?: string,
    @Query('tipe') tipe?: string,
    @Query('limit') limit?: string,
  ) {
    return this.lifecycleService.getEvents(tenantId, {
      assetId,
      tipe: tipe as any,
    });
  }

  @Get('transfers')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR')
  async getTransfers(@Headers('x-tenant-id') tenantId: string) {
    return this.lifecycleService.getTransfers(tenantId);
  }

  @Get('impairments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR')
  async getImpairments(@Headers('x-tenant-id') tenantId: string) {
    return this.lifecycleService.getImpairments(tenantId);
  }

  @Get('disposals')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR')
  async getDisposals(@Headers('x-tenant-id') tenantId: string) {
    return this.lifecycleService.getDisposals(tenantId);
  }
}
