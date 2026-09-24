import { Controller, Get, Post, Put, Body, Param, Query, HttpStatus } from '@nestjs/common';
import { TaxService } from './tax.service';
import { JenisPajak } from '@prisma/client';

@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('setting/:tenantId')
  async getSetting(@Param('tenantId') tenantId: string) {
    const data = await this.taxService.getTaxSetting(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Pengaturan pajak berhasil diambil',
      data,
    };
  }

  @Put('setting/:tenantId')
  async updateSetting(
    @Param('tenantId') tenantId: string,
    @Body() body: { tarif_ppn: number; npwp: string | null; aktifkan_pph21: boolean }
  ) {
    const data = await this.taxService.updateTaxSetting(tenantId, body.tarif_ppn, body.npwp, body.aktifkan_pph21);
    return {
      statusCode: HttpStatus.OK,
      message: 'Pengaturan pajak berhasil diperbarui',
      data,
    };
  }

  @Post('calculate-ppn')
  async calculatePpn(@Body() body: { tenantId: string; periode: string }) {
    const data = await this.taxService.calculatePPN(body.tenantId, body.periode);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Rekap PPN berhasil dihitung',
      data,
    };
  }

  @Post('calculate-pph21')
  async calculatePph21(@Body() body: { tenantId: string; periode: string }) {
    const data = await this.taxService.calculatePPH21(body.tenantId, body.periode);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Rekap PPh 21 berhasil dihitung',
      data,
    };
  }

  @Get('recap/:tenantId')
  async getRecaps(
    @Param('tenantId') tenantId: string,
    @Query('jenis') jenis?: JenisPajak,
    @Query('periode') periode?: string,
  ) {
    const data = await this.taxService.getTaxRecaps(tenantId, jenis, periode);
    return {
      statusCode: HttpStatus.OK,
      message: 'Riwayat rekap pajak berhasil diambil',
      data,
    };
  }
}
