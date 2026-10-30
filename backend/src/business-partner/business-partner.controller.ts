import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { BusinessPartnerService } from './business-partner.service';
import {
  CreateBusinessPartnerDto,
  UpdateBusinessPartnerDto,
  ImportBusinessPartnerDto,
} from './dto/business-partner.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('business-partners')
@UseGuards(JwtAuthGuard)
export class BusinessPartnerController {
  constructor(
    private readonly businessPartnerService: BusinessPartnerService,
  ) {}

  @Get(':tenantId')
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query('search') search?: string,
    @Query('type') type?: 'CUSTOMER' | 'VENDOR' | 'ALL',
    @Query('groupCode') groupCode?: string,
    @Query('isActive') isActive?: string,
  ) {
    const activeBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    const data = await this.businessPartnerService.findAll(tenantId, {
      search,
      type,
      groupCode,
      isActive: activeBool,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar mitra bisnis berhasil diambil',
      data,
    };
  }

  @Get(':tenantId/:id')
  async findOne(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.businessPartnerService.findOne(tenantId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Detail mitra bisnis berhasil diambil',
      data,
    };
  }

  @Post(':tenantId')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateBusinessPartnerDto,
  ) {
    const data = await this.businessPartnerService.create(tenantId, dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Mitra bisnis berhasil didaftarkan',
      data,
    };
  }

  @Put(':tenantId/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessPartnerDto,
  ) {
    const data = await this.businessPartnerService.update(tenantId, id, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Data mitra bisnis berhasil diperbarui',
      data,
    };
  }

  @Delete(':tenantId/:id')
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const data = await this.businessPartnerService.remove(tenantId, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Mitra bisnis berhasil dihapus',
      data,
    };
  }

  @Post(':tenantId/import-csv')
  async importCsv(
    @Param('tenantId') tenantId: string,
    @Body() body: ImportBusinessPartnerDto,
  ) {
    const data = await this.businessPartnerService.importBatch(
      tenantId,
      body.partners || [],
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Proses impor data mitra bisnis selesai',
      data,
    };
  }
}

