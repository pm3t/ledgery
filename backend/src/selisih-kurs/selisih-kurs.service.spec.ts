import { Test, TestingModule } from '@nestjs/testing';
import { SelisihKursService } from './selisih-kurs.service';

describe('SelisihKursService', () => {
  let service: SelisihKursService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SelisihKursService],
    }).compile();

    service = module.get<SelisihKursService>(SelisihKursService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
