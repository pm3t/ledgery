import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  HttpStatus,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../integration-log.interceptor';

@Controller('v1/periods')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
export class PeriodsV1Controller {
  constructor(private readonly periodService: AccountingPeriodService) {}

  @Get('check')
  async checkPeriod(@Req() req: any, @Query('date') dateStr?: string) {
    if (!dateStr) {
      throw new BadRequestException({
        errorCode: 'INVALID_PARAMETER',
        message: "Query parameter 'date' wajib diisi dengan format YYYY-MM-DD",
      });
    }

    const targetDate = new Date(dateStr);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException({
        errorCode: 'INVALID_DATE_FORMAT',
        message: "Format tanggal tidak valid. Gunakan format YYYY-MM-DD",
      });
    }

    const tenantId = req.tenantId;
    const result = await this.periodService.checkPeriodStatus(tenantId, targetDate);

    return {
      statusCode: HttpStatus.OK,
      message: 'Status periode akuntansi berhasil diperiksa',
      data: result,
    };
  }
}

