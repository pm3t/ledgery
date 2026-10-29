import { Controller, Get, Param, Query, HttpStatus } from '@nestjs/common';
import { GeneralLedgerService } from './general-ledger.service';

@Controller('ledger')
export class GeneralLedgerController {
  constructor(private readonly ledgerService: GeneralLedgerService) {}

  // GET /ledger/tenant/:tenantId/account/:accountId
  @Get('tenant/:tenantId/account/:accountId')
  async getAccountLedger(
    @Param('tenantId') tenantId: string,
    @Param('accountId') accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('dimensionValues') dimensionValues?: string,
    @Query('deskripsi') deskripsi?: string,
  ) {
    const ledger = await this.ledgerService.getAccountLedger(
      tenantId,
      accountId,
      startDate,
      endDate,
      dimensionValues,
      deskripsi,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Buku Besar berhasil diambil',
      data: ledger,
    };
  }
}
