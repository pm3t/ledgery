import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ChartOfAccountService } from './chart-of-account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { KategoriAkun } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';

@Controller()
export class ChartOfAccountController {
  constructor(
    private readonly chartOfAccountService: ChartOfAccountService,
  ) {}

  // ==========================================
  // Endpoint Publik (Integrasi Pihak Ketiga via API Key)
  // ==========================================

  // GET /v1/coa — Mengambil daftar COA read-only via API Key
  @Get('v1/coa')
  @UseGuards(ApiKeyGuard)
  async getCoaViaApiKey(@Req() req: any) {
    const tenantId = req.tenantId;
    const accounts = await this.chartOfAccountService.findByTenant(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar Chart of Accounts berhasil diambil via API Key',
      tenant: req.tenant?.nama_perusahaan,
      data: accounts,
    };
  }

  // ==========================================
  // Endpoint Internal Dashboard
  // ==========================================

  // POST /chart-of-accounts — Menambah kode akun baru
  @Post('chart-of-accounts')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createAccountDto: CreateAccountDto) {
    const account = await this.chartOfAccountService.create(createAccountDto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Kode akun berhasil ditambahkan',
      data: account,
    };
  }

  // GET /chart-of-accounts/tenant/:tenantId — Daftar akun per tenant dengan filter
  @Get('chart-of-accounts/tenant/:tenantId')
  async findByTenant(
    @Param('tenantId') tenantId: string,
    @Query('kategori') kategori?: KategoriAkun,
    @Query('search') search?: string,
  ) {
    const accounts = await this.chartOfAccountService.findByTenant(
      tenantId,
      kategori,
      search,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar kode akun berhasil diambil',
      data: accounts,
    };
  }

  // GET /chart-of-accounts/:id — Detail satu kode akun
  @Get('chart-of-accounts/:id')
  async findOne(@Param('id') id: string) {
    const account = await this.chartOfAccountService.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Detail kode akun berhasil diambil',
      data: account,
    };
  }

  // PATCH /chart-of-accounts/:id — Mengubah data akun
  @Patch('chart-of-accounts/:id')
  async update(
    @Param('id') id: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    const account = await this.chartOfAccountService.update(
      id,
      updateAccountDto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Data kode akun berhasil diperbarui',
      data: account,
    };
  }

  // DELETE /chart-of-accounts/:id — Menghapus kode akun
  @Delete('chart-of-accounts/:id')
  async remove(@Param('id') id: string) {
    await this.chartOfAccountService.remove(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Kode akun berhasil dihapus',
    };
  }
}
