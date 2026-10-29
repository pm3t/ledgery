import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../integration-log.interceptor';
import { V1ExceptionFilter } from '../v1-exception.filter';
import { ApiErrorCode } from '../../common/errors/api-error-code.enum';
import { LedgeryApiException } from '../../common/errors/ledgery-api.exception';
import { PeriodStatus } from '@prisma/client';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateCalendarDate(dateStr?: string): void {
  if (!dateStr || !DATE_REGEX.test(dateStr)) {
    throw new LedgeryApiException(
      ApiErrorCode.VALIDATION_ERROR,
      "Format tanggal tidak valid. Gunakan format YYYY-MM-DD (contoh: 2026-09-15).",
      400,
      { date: dateStr },
    );
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    throw new LedgeryApiException(
      ApiErrorCode.VALIDATION_ERROR,
      `Tanggal '${dateStr}' tidak valid pada kalender (contoh bukan tanggal kabisat atau tanggal di luar hari dalam bulan).`,
      400,
      { date: dateStr },
    );
  }
}

@Controller('v1/periods')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class PeriodsV1Controller {
  constructor(private readonly periodService: AccountingPeriodService) {}

  @Get('check')
  async checkPeriod(@Req() req: any, @Query('date') dateStr?: string) {
    if (!dateStr) {
      throw new LedgeryApiException(
        ApiErrorCode.VALIDATION_ERROR,
        "Query parameter 'date' wajib diisi dengan format YYYY-MM-DD.",
        400,
        { field: 'date' },
      );
    }

    validateCalendarDate(dateStr);

    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    const tenantId = req.tenantId;
    const evaluation = await this.periodService.evaluatePostingDate(
      tenantId,
      targetDate,
    );

    return {
      date: dateStr,
      status: evaluation.status,
      can_post: evaluation.can_post,
      period: evaluation.period,
    };
  }

  @Get()
  async getPeriods(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    if (from) {
      validateCalendarDate(from);
    }
    if (to) {
      validateCalendarDate(to);
    }

    let parsedStatus: PeriodStatus | undefined;
    if (status) {
      if (status !== 'OPEN' && status !== 'CLOSED') {
        throw new LedgeryApiException(
          ApiErrorCode.VALIDATION_ERROR,
          "Query parameter 'status' harus bernilai 'OPEN' atau 'CLOSED'.",
          400,
          { status },
        );
      }
      parsedStatus = status as PeriodStatus;
    }

    const tenantId = req.tenantId;
    const periods = await this.periodService.getPeriodsV1(tenantId, {
      from,
      to,
      status: parsedStatus,
    });

    return {
      data: periods,
    };
  }
}
