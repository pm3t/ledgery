import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

// Controller untuk Manajemen Tenant (Akses Super Admin ABP)
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  // POST /tenants — Menambah tenant baru
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTenantDto: CreateTenantDto) {
    const tenant = await this.tenantService.create(createTenantDto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tenant berhasil didaftarkan',
      data: tenant,
    };
  }

  // GET /tenants — Menampilkan daftar semua tenant
  @Get()
  async findAll() {
    const tenants = await this.tenantService.findAll();
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar tenant berhasil diambil',
      data: tenants,
    };
  }

  // GET /tenants/:id — Menampilkan detail satu tenant
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const tenant = await this.tenantService.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Detail tenant berhasil diambil',
      data: tenant,
    };
  }

  // PATCH /tenants/:id — Mengubah data tenant
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTenantDto: UpdateTenantDto,
  ) {
    const tenant = await this.tenantService.update(id, updateTenantDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Data tenant berhasil diperbarui',
      data: tenant,
    };
  }

  // DELETE /tenants/:id — Menghapus tenant
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.tenantService.remove(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Tenant berhasil dihapus',
    };
  }
}
