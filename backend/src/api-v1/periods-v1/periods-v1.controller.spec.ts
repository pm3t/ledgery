import { Test, TestingModule } from '@nestjs/testing';
import { PeriodsV1Controller } from './periods-v1.controller';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import { IntegrationLogService } from '../../integration-log/integration-log.service';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../integration-log.interceptor';
import { BadRequestException } from '@nestjs/common';

describe('PeriodsV1Controller', () => {
  let controller: PeriodsV1Controller;
  let periodService: Partial<AccountingPeriodService>;

  beforeEach(async () => {
    periodService = {
      checkPeriodStatus: jest.fn().mockResolvedValue({
        date: '2026-10-29',
        isOpen: true,
        status: 'OPEN',
        periodNumber: 10,
        fiscalYear: '2026',
      }),
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

  it('should return period status when valid date is provided', async () => {
    const req = { tenantId: 'tenant-1' } as any;
    const result = await controller.checkPeriod(req, '2026-10-29');

    expect(periodService.checkPeriodStatus).toHaveBeenCalledWith('tenant-1', new Date('2026-10-29'));
    expect(result.data.isOpen).toBe(true);
    expect(result.data.periodNumber).toBe(10);
  });

  it('should throw BadRequestException when date query is missing', async () => {
    const req = { tenantId: 'tenant-1' } as any;
    await expect(controller.checkPeriod(req, undefined)).rejects.toThrow(BadRequestException);
  });
});

