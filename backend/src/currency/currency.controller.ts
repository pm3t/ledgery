import { Controller, Get, Post, Body, Param, Query, HttpStatus } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';

@Controller()
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  // --- GLOBAL CURRENCIES ---
  @Get('currencies')
  async getCurrencies() {
    const data = await this.currencyService.getCurrencies();
    return {
      statusCode: HttpStatus.OK,
      message: 'Berhasil mengambil daftar mata uang',
      data,
    };
  }

  @Post('currencies')
  async createCurrency(@Body() body: { kode_iso: string; nama: string }) {
    const data = await this.currencyService.createCurrency(body.kode_iso, body.nama);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Berhasil menambahkan mata uang',
      data,
    };
  }

  // --- EXCHANGE RATES ---
  @Get('settings/exchange-rates/:tenantId')
  async getExchangeRates(
    @Param('tenantId') tenantId: string,
    @Query('tanggal') tanggal?: string,
    @Query('currencyId') currencyId?: string,
  ) {
    const data = await this.currencyService.getExchangeRates(tenantId, tanggal, currencyId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Berhasil mengambil data kurs',
      data,
    };
  }

  @Post('settings/exchange-rates')
  async setExchangeRate(@Body() dto: CreateExchangeRateDto) {
    const data = await this.currencyService.setExchangeRate(dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Berhasil mengatur kurs',
      data,
    };
  }
}
