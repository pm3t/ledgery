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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { AssetCategoryService } from '../services/asset-category.service';
import { CreateAssetCategoryDto, UpdateAssetCategoryDto } from '../dto/fixed-asset.dto';

@Controller('fixed-assets/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetCategoryController {
  constructor(private readonly categoryService: AssetCategoryService) {}

  @Get()
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async findAll(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.categoryService.findAll(tenantId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN_TENANT, UserRole.STAF_AKUNTANSI)
  async findOne(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.categoryService.findOne(tenantId, id);
  }

  @Post()
  @Roles(UserRole.ADMIN_TENANT)
  async create(@Request() req: any, @Body() dto: CreateAssetCategoryDto) {
    const tenantId = req.user.tenantId;
    return this.categoryService.create(tenantId, dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN_TENANT)
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAssetCategoryDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.categoryService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN_TENANT)
  async delete(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.categoryService.delete(tenantId, id);
  }
}
