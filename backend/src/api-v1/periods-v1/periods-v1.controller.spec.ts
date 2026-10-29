import { Test, TestingModule } from '@nestjs/testing';
import { PeriodsV1Controller } from './periods-v1.controller';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import { IntegrationLogService } from '../../integration-log/integration-log.service';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../integration-log.interceptor';
import { LedgeryApiException } from '../../common/errors/ledgery-api.exception';

describe('PeriodsV1Controller', () => {
  let controller: PeriodsV1Controller;
  let periodService: Partial<AccountingPeriodService>;

  beforeEach(async () => {
    periodService = {
      evaluatePostingDate: jest.fn().mockResolvedValue({
        date: '2026-10-29',
        can_post: true,
        status: 'OPEN',
        period: {
          id: 'per-10',
          name: 'Periode 10 (Tahun Buku 2026)',
          start_date: '2026-10-01',
          end_date: '2026-10-31',
        },
      }),
      getPeriodsV1: jest.fn().mockResolvedValue([
        {
          id: 'per-10',
          name: 'Periode 10 (Tahun Buku 2026)',
          start_date: '2026-10-01',
          end_date: '2026-10-31',
          status: 'OPEN',
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PeriodsV1Controller],
      providers: [
        { provide: AccountingPeriodService, useValue: periodService },
        { provide: IntegrationLogService, useValue: {} },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(IntegrationLogInterceptor)
      .useValue({ intercept: (context, next) => next.handle() })
      .compile();

    controller = module.get<PeriodsV1Controller>(PeriodsV1Controller);
  });

  it('should return period status and can_post when valid date is provided', async () => {
    const req = { tenantId: 'tenant-1' } as any;
    const result = await controller.checkPeriod(req, '2026-10-29');

    expect(periodService.evaluatePostingDate).toHaveBeenCalledWith(
      'tenant-1',
      new Date('2026-10-29T00:00:00.000Z'),
    );
    expect(result.date).toBe('2026-10-29');
    expect(result.status).toBe('OPEN');
    expect(result.can_post).toBe(true);
    expect(result.period?.id).toBe('per-10');
  });

  it('should throw LedgeryApiException (VALIDATION_ERROR) when date query is missing', async () => {
    const req = { tenantId: 'tenant-1' } as any;
    await expect(controller.checkPeriod(req, undefined)).rejects.toThrow(
      LedgeryApiException,
    );
  });

  it('should reject invalid calendar dates like 2026-02-30 with VALIDATION_ERROR', async () => {
    const req = { tenantId: 'tenant-1' } as any;
    await expect(controller.checkPeriod(req, '2026-02-30')).rejects.toThrow(
      LedgeryApiException,
    );
  });

  it('should list periods via GET /v1/periods', async () => {
    const req = { tenantId: 'tenant-1' } as any;
    const result = await controller.getPeriods(req, '2026-01-01', '2026-12-31', 'OPEN');

    expect(periodService.getPeriodsV1).toHaveBeenCalledWith('tenant-1', {
      from: '2026-01-01',
      to: '2026-12-31',
      status: 'OPEN',
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe('OPEN');
  });
});
