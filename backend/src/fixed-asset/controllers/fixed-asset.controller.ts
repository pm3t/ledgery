import {
  Controller,
  Get,
  Post,
  Put,
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
import { FixedAssetService } from '../services/fixed-asset.service';
import {
  CreateFixedAssetDto,
  UpdateFixedAssetDto,
  ActivateAssetDto,
  CapitalizeCipDto,
  DuplicateNAssetDto,
  ImportOpeningBalanceDto,
} from '../dto/fixed-asset.dto';
import { FixedAssetStatus } from '@prisma/client';

@Controller('fixed-assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FixedAssetController {
  constructor(private readonly assetService: FixedAssetService) {}

  @Get()
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI, UserRole.PETUGAS_ASET)
  async findAll(
    @Request() req: any,
    @Query('status') status?: FixedAssetStatus,
    @Query('categoryId') categoryId?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('externalRef') externalRef?: string,
  ) {
    const tenantId = req.user.tenantId;
    const role = req.user.role;
    return this.assetService.findAll(tenantId, {
      status,
      categoryId,
      searchQuery,
      externalRef,
      role,
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI, UserRole.PETUGAS_ASET)
  async findOne(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    const role = req.user.role;
    return this.assetService.findOne(tenantId, id, role);
  }

  @Post()
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async create(@Request() req: any, @Body() dto: CreateFixedAssetDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.assetService.create(tenantId, dto, userId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFixedAssetDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.assetService.update(tenantId, id, dto, userId);
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async activate(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ActivateAssetDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.assetService.activate(tenantId, id, dto, userId);
  }

  @Post(':id/capitalize')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async capitalize(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CapitalizeCipDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.assetService.capitalizeCip(tenantId, id, dto, userId);
  }

  @Post(':id/duplicate-n')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async duplicateN(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: DuplicateNAssetDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.assetService.duplicateN(tenantId, id, dto, userId);
  }

  @Post('opening-balance')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async importOpeningBalance(
    @Request() req: any,
    @Body() dto: ImportOpeningBalanceDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    return this.assetService.importOpeningBalance(tenantId, dto, userId);
  }

  @Post(':id/attachments')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI, UserRole.PETUGAS_ASET)
  async uploadAttachment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { namaFile: string; tipe: string; fileBase64: string },
  ) {
    if (!body.fileBase64 || !body.namaFile) {
      throw new BadRequestException('namaFile dan fileBase64 wajib disertakan.');
    }
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    const buffer = Buffer.from(body.fileBase64, 'base64');
    return this.assetService.uploadAttachment(
      tenantId,
      id,
      buffer,
      body.namaFile,
      body.tipe || 'application/octet-stream',
      userId,
    );
  }

  @Get(':id/timeline')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI, UserRole.PETUGAS_ASET)
  async getTimeline(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.assetService.getTimeline(tenantId, id);
  }
}
