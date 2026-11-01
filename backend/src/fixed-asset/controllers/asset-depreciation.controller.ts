import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { AssetDepreciationService } from '../services/asset-depreciation.service';
import {
  PostDepreciationRunDto,
  AddCostAdditionDto,
  RecordEstimateChangeDto,
} from '../dto/fixed-asset.dto';

@Controller('fixed-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetDepreciationController {
  constructor(private readonly depreciationService: AssetDepreciationService) {}

  /**
   * GET /fixed-assets/depreciation/preview?periodId=xxx
   * Menampilkan simulasi beban penyusutan dan preview jurnal GL untuk periode tertentu
   */
  @Get('depreciation/preview')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async previewDepreciation(
    @Request() req: any,
    @Query('periodId') periodId: string,
  ) {
    if (!periodId) {
      throw new BadRequestException('Query parameter periodId wajib diisi.');
    }
    const tenantId = req.user.tenantId;
    return this.depreciationService.preview(tenantId, periodId);
  }

  /**
   * GET /fixed-assets/depreciation/runs
   * Riwayat proses penyusutan yang pernah dijalankan
   */
  @Get('depreciation/runs')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async getDepreciationRuns(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.depreciationService.getRuns(tenantId);
  }

  /**
   * POST /fixed-assets/depreciation/runs
   * Eksekusi posting proses penyusutan bulanan (atomik dengan jurnal GL)
   */
  @Post('depreciation/runs')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async postDepreciationRun(
    @Request() req: any,
    @Body() dto: PostDepreciationRunDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId || req.user.id;
    return this.depreciationService.post(tenantId, dto.periodId, userId);
  }

  /**
   * POST /fixed-assets/depreciation/runs/:id/reverse
   * Membatalkan proses penyusutan dan membalik jurnal GL
   */
  @Post('depreciation/runs/:id/reverse')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async reverseDepreciationRun(
    @Request() req: any,
    @Param('id') runId: string,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId || req.user.id;
    return this.depreciationService.reverse(tenantId, runId, userId);
  }

  /**
   * GET /fixed-assets/:id/schedule
   * Mengambil jadwal proyeksi penyusutan komparatif (Komersial vs Fiskal)
   * Menyensor nilai finansial jika diakses oleh PETUGAS_ASET
   */
  @Get(':id/schedule')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI, UserRole.PETUGAS_ASET)
  async getAssetSchedule(
    @Request() req: any,
    @Param('id') assetId: string,
  ) {
    const tenantId = req.user.tenantId;
    const role = req.user.role;
    return this.depreciationService.getAssetSchedule(tenantId, assetId, role);
  }

  /**
   * POST /fixed-assets/:id/cost-additions
   * Penambahan nilai / pengeluaran lanjutan yang dikapitalisasi
   */
  @Post(':id/cost-additions')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async addCostAddition(
    @Request() req: any,
    @Param('id') assetId: string,
    @Body() dto: AddCostAdditionDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId || req.user.id;
    return this.depreciationService.addCostAddition(tenantId, assetId, dto, userId);
  }

  /**
   * POST /fixed-assets/:id/estimate-changes
   * Pencatatan perubahan estimasi akuntansi secara prospektif
   */
  @Post(':id/estimate-changes')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async recordEstimateChange(
    @Request() req: any,
    @Param('id') assetId: string,
    @Body() dto: RecordEstimateChangeDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId || req.user.id;
    return this.depreciationService.recordEstimateChange(tenantId, assetId, dto, userId);
  }

  /**
   * POST /fixed-assets/verify-sync
   * Sinkronisasi & verifikasi ulang denormalisasi saldo aset
   */
  @Post('verify-sync')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async verifyAndSync(@Request() req: any, @Query('assetId') assetId?: string) {
    const tenantId = req.user.tenantId;
    return this.depreciationService.verifyAndSyncAssetBalances(tenantId, assetId);
  }
}

