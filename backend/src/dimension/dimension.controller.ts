import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { DimensionService } from './dimension.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // Assuming JWT Auth is used for tenant dashboard

@Controller('dimensions')
@UseGuards(JwtAuthGuard)
export class DimensionController {
  constructor(private readonly dimensionService: DimensionService) {}

  @Post()
  create(@Req() req: any, @Body() data: { nama_dimension: string }) {
    return this.dimensionService.createDimension(req.user.tenantId, data);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.dimensionService.findAllDimensions(req.user.tenantId);
  }

  @Post(':id/values')
  addValue(@Param('id') id: string, @Body() data: { kode: string, nama: string }) {
    return this.dimensionService.addDimensionValue(id, data);
  }

  @Delete(':id')
  removeDimension(@Param('id') id: string) {
    return this.dimensionService.removeDimension(id);
  }

  @Delete('values/:id')
  removeValue(@Param('id') id: string) {
    return this.dimensionService.removeDimensionValue(id);
  }
}
