import { Controller, Get, Post, Body, Param, Put, UseGuards, HttpStatus } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BillingStatus } from '@prisma/client';

// Proteksi seluruh endpoint di controller ini khusus untuk role SUPER_ADMIN
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN')
export class SuperAdminController {
  constructor(private readonly adminService: SuperAdminService) {}

  @Post('tenants/onboard')
  async onboardTenant(@Body() body: { nama_perusahaan: string; tahun_buku_mulai: number; mata_uang: string }) {
    const data = await this.adminService.onboardTenant(body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tenant berhasil di-onboard lengkap dengan default COA dan Kebijakan Posting',
      data,
    };
  }

  @Get('tenants')
  async getTenants() {
    const data = await this.adminService.getAllTenants();
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar seluruh tenant berhasil diambil',
      data,
    };
  }

  @Put('tenants/:id/billing')
  async updateBilling(
    @Param('id') id: string,
    @Body() body: { status: BillingStatus, extendedDays?: number }
  ) {
    const data = await this.adminService.updateBilling(id, body.status, body.extendedDays);
    return {
      statusCode: HttpStatus.OK,
      message: 'Status billing tenant berhasil diperbarui',
      data,
    };
  }

  @Get('tenants/:id/connected-apps')
  async getConnectedApps(@Param('id') id: string) {
    const data = await this.adminService.getConnectedApps(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar aplikasi terhubung berhasil diambil',
      data,
    };
  }

  @Post('audit-logs')
  async createAuditLog(@Body() body: { action: string; targetTenantId: string; deskripsi: string }) {
    // Dipanggil oleh Frontend saat Super Admin secara eksplisit melihat data detail jurnal tenant
    const data = await this.adminService.logAccess('SUPER_ADMIN', body.action, body.targetTenantId, body.deskripsi);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Audit log tercatat',
      data,
    };
  }

  @Get('audit-logs')
  async getAuditLogs() {
    const data = await this.adminService.getAuditLogs();
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar audit log berhasil diambil',
      data,
    };
  }

  @Get('api-keys')
  async getAllApiKeys() {
    const data = await this.adminService.getAllApiKeys();
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar seluruh API Keys berhasil diambil',
      data,
    };
  }
}
