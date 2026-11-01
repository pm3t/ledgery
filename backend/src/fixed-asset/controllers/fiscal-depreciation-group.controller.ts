import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { FiscalDepreciationGroupService } from '../services/fiscal-depreciation-group.service';
import { CreateFiscalGroupDto, UpdateFiscalGroupDto } from '../dto/fixed-asset.dto';

@Controller('fixed-assets/fiscal-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FiscalDepreciationGroupController {
  constructor(private readonly fiscalService: FiscalDepreciationGroupService) {}

  @Get()
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async findAll(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.fiscalService.findAll(tenantId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async findOne(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.fiscalService.findOne(tenantId, id);
  }

  @Post()
  @Roles(UserRole.ADMIN_TENANT)
  async create(@Request() req: any, @Body() dto: CreateFiscalGroupDto) {
    const tenantId = req.user.tenantId;
    return this.fiscalService.create(tenantId, dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN_TENANT)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFiscalGroupDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.fiscalService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN_TENANT)
  async delete(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.fiscalService.delete(tenantId, id);
  }

  @Post('seed')
  @Roles(UserRole.ADMIN_TENANT)
  async seed(@Request() req: any, @Query('specificIndustries') specificIndustries?: string) {
    const tenantId = req.user.tenantId;
    const includeSpecific = specificIndustries === 'true';
    return this.fiscalService.seedFiscalGroups(tenantId, includeSpecific);
  }
}
