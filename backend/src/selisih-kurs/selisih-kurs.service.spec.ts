import { Test, TestingModule } from '@nestjs/testing';
import { SelisihKursService } from './selisih-kurs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SelisihKursService', () => {
  let service: SelisihKursService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelisihKursService,
        {
          provide: PrismaService,
          useValue: {
            journal: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<SelisihKursService>(SelisihKursService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
