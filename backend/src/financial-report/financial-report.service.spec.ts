import { Test, TestingModule } from '@nestjs/testing';
import { FinancialReportService } from './financial-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { KategoriAkun } from '@prisma/client';

describe('FinancialReportService', () => {
  let service: FinancialReportService;
  let prisma: PrismaService;

  beforeEach(async () => {
    // Mock PrismaService
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialReportService,
        {
          provide: PrismaService,
          useValue: {
            chartOfAccount: {
              findMany: jest.fn(),
            },
            journalEntry: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<FinancialReportService>(FinancialReportService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBalanceSheet', () => {
    it('should verify the basic accounting equation: Total Aset = Total Liabilitas + Ekuitas', async () => {
      // Setup Mock Data
      // COAs
      const mockCoas = [
        { id: '1', tenantId: 't1', kode_akun: '100', nama_akun: 'Kas', kategori: KategoriAkun.ASET, isActive: true },
        { id: '2', tenantId: 't1', kode_akun: '200', nama_akun: 'Hutang', kategori: KategoriAkun.LIABILITAS, isActive: true },
        { id: '3', tenantId: 't1', kode_akun: '300', nama_akun: 'Modal', kategori: KategoriAkun.EKUITAS, isActive: true },
        { id: '4', tenantId: 't1', kode_akun: '400', nama_akun: 'Pendapatan', kategori: KategoriAkun.PENDAPATAN, isActive: true },
        { id: '5', tenantId: 't1', kode_akun: '500', nama_akun: 'Beban', kategori: KategoriAkun.BEBAN, isActive: true },
      ];

      // Entries (Jurnal)
      const mockEntries = [
        // Setoran modal: Kas bertambah 10.000, Modal bertambah 10.000
        { id: 'e1', chartOfAccountId: '1', tipe: 'DEBIT', jumlah: 10000 },
        { id: 'e2', chartOfAccountId: '3', tipe: 'KREDIT', jumlah: 10000 },
        // Pinjaman hutang: Kas bertambah 5.000, Hutang bertambah 5.000
        { id: 'e3', chartOfAccountId: '1', tipe: 'DEBIT', jumlah: 5000 },
        { id: 'e4', chartOfAccountId: '2', tipe: 'KREDIT', jumlah: 5000 },
        // Jual Jasa: Kas bertambah 2.000, Pendapatan 2.000
        { id: 'e5', chartOfAccountId: '1', tipe: 'DEBIT', jumlah: 2000 },
        { id: 'e6', chartOfAccountId: '4', tipe: 'KREDIT', jumlah: 2000 },
        // Bayar Beban: Beban bertambah 1.000, Kas berkurang 1.000
        { id: 'e7', chartOfAccountId: '5', tipe: 'DEBIT', jumlah: 1000 },
        { id: 'e8', chartOfAccountId: '1', tipe: 'KREDIT', jumlah: 1000 },
      ];

      jest.spyOn(prisma.chartOfAccount, 'findMany').mockResolvedValue(mockCoas as any);
      jest.spyOn(prisma.journalEntry, 'findMany').mockResolvedValue(mockEntries as any);

      // Eksekusi
      const result = await service.getBalanceSheet('t1');

      // Verifikasi Perhitungan:
      // Saldo Kas = 10000 + 5000 + 2000 - 1000 = 16000 (ASET)
      // Saldo Hutang = 5000 (LIABILITAS)
      // Saldo Modal = 10000 (EKUITAS AWAL)
      // Pendapatan = 2000, Beban = 1000 -> Laba Bersih = 1000
      // Total Ekuitas = 10000 + 1000 = 11000
      
      expect(result.totalAset).toBe(16000);
      expect(result.totalLiabilitas).toBe(5000);
      expect(result.totalEkuitas).toBe(11000); // Ekuitas awal + Laba Bersih
      
      // Basic Accounting Equation
      expect(result.totalAset).toEqual(result.totalLiabilitas + result.totalEkuitas);
      expect(result.isBalanced).toBe(true);
    });
  });
});
