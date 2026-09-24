import { Test, TestingModule } from '@nestjs/testing';
import { AccountingPeriodService } from './accounting-period.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { PeriodStatus } from '@prisma/client';

describe('AccountingPeriodService', () => {
  let service: AccountingPeriodService;
  let prisma: PrismaService;

  const mockPrisma = {
    fiscalYear: {
      findFirst: jest.fn(),
    },
    accountingPeriod: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingPeriodService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccountingPeriodService>(AccountingPeriodService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('seharusnya lolos jika tenant tidak memiliki tahun buku (backward compatibility)', async () => {
    mockPrisma.fiscalYear.findFirst.mockResolvedValue(null);
    const result = await service.validateJournalDate('tenant1', new Date('2026-01-15'));
    expect(result).toBe(true);
  });

  it('seharusnya menolak jika tanggal berada di periode yang CLOSED', async () => {
    // Mock Fiscal Year ketemu
    mockPrisma.fiscalYear.findFirst.mockResolvedValue({ id: 'fy1', nama_tahun_buku: '2026' });
    
    // Mock Periode ketemu tapi CLOSED
    mockPrisma.accountingPeriod.findFirst.mockResolvedValue({
      id: 'per1',
      nomor_periode: 1,
      status: PeriodStatus.CLOSED,
    });

    await expect(service.validateJournalDate('tenant1', new Date('2026-01-15'))).rejects.toThrow(BadRequestException);
    await expect(service.validateJournalDate('tenant1', new Date('2026-01-15'))).rejects.toThrow('Periode 1 (2026) sudah ditutup. Jurnal tidak dapat diposting.');
  });

  it('seharusnya lolos jika tanggal berada di periode yang OPEN', async () => {
    // Mock Fiscal Year ketemu
    mockPrisma.fiscalYear.findFirst.mockResolvedValue({ id: 'fy1', nama_tahun_buku: '2026' });
    
    // Mock Periode ketemu dan OPEN
    mockPrisma.accountingPeriod.findFirst.mockResolvedValue({
      id: 'per1',
      nomor_periode: 1,
      status: PeriodStatus.OPEN,
    });

    const result = await service.validateJournalDate('tenant1', new Date('2026-01-15'));
    expect(result).toBe(true);
  });
});
