import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
  Response,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AssetLabelService } from '../services/asset-label.service';
import {
  CreateLabelTemplateDto,
  UpdateLabelTemplateDto,
  PrintLabelsDto,
} from '../dto/asset-label.dto';
import { Response as ExpressResponse } from 'express';

@Controller('fixed-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetLabelController {
  constructor(private readonly labelService: AssetLabelService) {}

  @Get('label-templates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR', 'PETUGAS_ASET')
  async getTemplates(@Headers('x-tenant-id') tenantId: string) {
    return this.labelService.getTemplates(tenantId);
  }

  @Post('label-templates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async createTemplate(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreateLabelTemplateDto,
  ) {
    return this.labelService.createTemplate(tenantId, dto);
  }

  @Put('label-templates/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async updateTemplate(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLabelTemplateDto,
  ) {
    return this.labelService.updateTemplate(tenantId, id, dto);
  }

  @Post('label-templates/:id/default')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR')
  async setDefault(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.labelService.setDefaultTemplate(tenantId, id);
  }

  @Delete('label-templates/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async deleteTemplate(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.labelService.deleteTemplate(tenantId, id);
  }

  @Post('labels/print')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'PETUGAS_ASET')
  async printLabels(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: PrintLabelsDto,
    @Request() req: any,
    @Res() res: ExpressResponse,
  ) {
    const user = {
      id: req.user?.id,
      nama: req.user?.name || req.user?.email || 'User',
      role: req.user?.role,
    };

    const result = await this.labelService.renderLabelsPdf(tenantId, dto, user);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="asset-labels.pdf"',
      'Content-Length': result.pdfBuffer.length,
      'X-Printed-Count': result.count.toString(),
    });

    return res.end(result.pdfBuffer);
  }

  @Get('labels/status-report')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR', 'PETUGAS_ASET')
  async getStatusReport(@Headers('x-tenant-id') tenantId: string) {
    return this.labelService.getLabelingStatusReport(tenantId);
  }

  @Get('labels/print-logs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR', 'PETUGAS_ASET')
  async getPrintLogs(
    @Headers('x-tenant-id') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.labelService.getPrintLogs(tenantId, limit ? parseInt(limit, 10) : 20);
  }
}

