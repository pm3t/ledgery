import {
  Controller,
  Get,
  UseGuards,
  Req,
  HttpStatus,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { ChartOfAccountService } from '../../chart-of-account/chart-of-account.service';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../integration-log.interceptor';
import { V1ExceptionFilter } from '../v1-exception.filter';

@Controller('v1/chart-of-accounts')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class CoaV1Controller {
  constructor(private readonly coaService: ChartOfAccountService) {}

  @Get()
  async getExternalCoa(@Req() req: any) {
    const tenantId = req.tenantId;
    const coa = await this.coaService.findByTenant(tenantId);
    
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar Chart of Accounts berhasil diambil via API Key (Read-only)',
      data: coa,
    };
  }
}
