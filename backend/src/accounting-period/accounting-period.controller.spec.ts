import { Test, TestingModule } from '@nestjs/testing';
import { AccountingPeriodController } from './accounting-period.controller';

describe('AccountingPeriodController', () => {
  let controller: AccountingPeriodController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingPeriodController],
    }).compile();

    controller = module.get<AccountingPeriodController>(AccountingPeriodController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
