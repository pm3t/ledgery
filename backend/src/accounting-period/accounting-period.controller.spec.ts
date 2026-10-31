import { Test, TestingModule } from '@nestjs/testing';
import { AccountingPeriodController } from './accounting-period.controller';
import { AccountingPeriodService } from './accounting-period.service';

describe('AccountingPeriodController', () => {
  let controller: AccountingPeriodController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingPeriodController],
      providers: [
        {
          provide: AccountingPeriodService,
          useValue: {
            createFiscalYear: jest.fn(),
            closePeriod: jest.fn(),
            reopenPeriod: jest.fn(),
            getPeriods: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AccountingPeriodController>(AccountingPeriodController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
