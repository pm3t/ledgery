import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AssetReportService } from '../services/asset-report.service';

/**
 * Controller untuk Laporan Finansial Aset Tetap:
 * 1. Daftar Aset Tetap per tanggal
 * 2. Mutasi Aset Tetap (Roll-Forward PSAK 216 / PSAK 238)
 * 3. Penyusutan per Dimensi
 * 4. Jadwal Proyeksi Penyusutan
 * 5. Rekonsiliasi Komersial vs Fiskal (Pajak)
 * 6. Aset Disusutkan Penuh
 * 7. Laba / Rugi Pelepasan Aset
 *
 * Catatan Keamanan: Peran PETUGAS_ASET secara ketat ditolak di level Controller & Service.
 */
@Controller('fixed-assets/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR')
export class AssetReportController {
  constructor(private readonly reportService: AssetReportService) {}

  @Get('list')
  async getListReport(
    @Request() req: any,
    @Query('asOfDate') asOfDate?: string,
    @Query('categoryId') categoryId?: string,
    @Query('dimensionValueId') dimensionValueId?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getListReport(tenantId, {
      asOfDate,
      categoryId,
      dimensionValueId,
      role: req.user.role,
    });
  }

  @Get('roll-forward')
  async getRollForwardReport(
    @Request() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getRollForwardReport(tenantId, {
      startDate: startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      endDate: endDate || new Date().toISOString().slice(0, 10),
      categoryId,
      role: req.user.role,
    });
  }

  @Get('by-dimension')
  async getDepreciationByDimension(
    @Request() req: any,
    @Query('periodId') periodId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('dimensionId') dimensionId?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getDepreciationByDimensionReport(tenantId, {
      periodId,
      startDate,
      endDate,
      dimensionId,
      role: req.user.role,
    });
  }

  @Get('projection')
  async getDepreciationProjection(
    @Request() req: any,
    @Query('categoryId') categoryId?: string,
    @Query('assetId') assetId?: string,
    @Query('years') years?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getDepreciationProjectionReport(tenantId, {
      categoryId,
      assetId,
      years: years ? parseInt(years, 10) : 5,
      role: req.user.role,
    });
  }

  @Get('commercial-vs-fiscal')
  async getCommercialVsFiscal(
    @Request() req: any,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getCommercialVsFiscalReport(tenantId, {
      fiscalYear: fiscalYear ? parseInt(fiscalYear, 10) : new Date().getFullYear(),
      categoryId,
      role: req.user.role,
    });
  }

  @Get('fully-depreciated')
  async getFullyDepreciated(
    @Request() req: any,
    @Query('categoryId') categoryId?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getFullyDepreciatedReport(tenantId, {
      categoryId,
      role: req.user.role,
    });
  }

  @Get('disposal-gain-loss')
  async getDisposalGainLoss(
    @Request() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getDisposalGainLossReport(tenantId, {
      startDate: startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      endDate: endDate || new Date().toISOString().slice(0, 10),
      categoryId,
      role: req.user.role,
    });
  }
}

