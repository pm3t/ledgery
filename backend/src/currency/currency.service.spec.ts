import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyService } from './currency.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CurrencyService', () => {
  let service: CurrencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyService,
        {
          provide: PrismaService,
          useValue: {
            currency: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
            exchangeRate: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<CurrencyService>(CurrencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
