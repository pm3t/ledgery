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
            dimension: {
              findFirst: jest.fn(),
            },
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

  describe('getDimensionAnalysisMatrix', () => {
    it('should generate pivot matrix with COA rows, dimension columns, and values', async () => {
      const mockDimension = {
        id: 'dim-cc',
        tenantId: 't1',
        nama_dimension: 'Cost Center',
        values: [
          { id: 'v-acc', kode: 'ACC', nama: 'Accounting' },
          { id: 'v-hr', kode: 'HR', nama: 'Human Resources' },
        ],
      };

      const mockCoas = [
        { id: 'c1', tenantId: 't1', kode_akun: '5101', nama_akun: 'Beban Gaji', kategori: KategoriAkun.BEBAN, isActive: true },
        { id: 'c2', tenantId: 't1', kode_akun: '5102', nama_akun: 'Beban Sewa', kategori: KategoriAkun.BEBAN, isActive: true },
      ];

      const mockEntries = [
        // Beban Gaji untuk Accounting: Rp 5.000.000
        {
          chartOfAccountId: 'c1',
          tipe: 'DEBIT',
          jumlah: 5000000,
          dimensions: [{ dimensionValueId: 'v-acc' }],
        },
        // Beban Gaji untuk HR: Rp 3.000.000
        {
          chartOfAccountId: 'c1',
          tipe: 'DEBIT',
          jumlah: 3000000,
          dimensions: [{ dimensionValueId: 'v-hr' }],
        },
        // Beban Sewa tanpa dimensi: Rp 2.000.000
        {
          chartOfAccountId: 'c2',
          tipe: 'DEBIT',
          jumlah: 2000000,
          dimensions: [],
        },
      ];

      jest.spyOn(prisma.dimension, 'findFirst').mockResolvedValue(mockDimension as any);
      jest.spyOn(prisma.chartOfAccount, 'findMany').mockResolvedValue(mockCoas as any);
      jest.spyOn(prisma.journalEntry, 'findMany').mockResolvedValue(mockEntries as any);

      const matrix = await service.getDimensionAnalysisMatrix('t1', {
        dimensionId: 'dim-cc',
        tipeSaldo: 'MUTASI',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(matrix.dimension.nama_dimension).toBe('Cost Center');
      expect(matrix.columns).toHaveLength(2);
      expect(matrix.columns[0].kode).toBe('ACC');
      expect(matrix.columns[1].kode).toBe('HR');
      expect(matrix.hasUnassigned).toBe(true);

      // Verify Beban Gaji (c1)
      const gajiRow = matrix.rows.find((r) => r.coa.id === 'c1');
      expect(gajiRow).toBeDefined();
      expect(gajiRow!.values['v-acc']).toBe(5000000);
      expect(gajiRow!.values['v-hr']).toBe(3000000);
      expect(gajiRow!.values['UNASSIGNED']).toBe(0);
      expect(gajiRow!.total).toBe(8000000);

      // Verify Beban Sewa (c2)
      const sewaRow = matrix.rows.find((r) => r.coa.id === 'c2');
      expect(sewaRow).toBeDefined();
      expect(sewaRow!.values['UNASSIGNED']).toBe(2000000);
      expect(sewaRow!.total).toBe(2000000);

      // Verify Column Totals & Grand Total
      expect(matrix.columnTotals['v-acc']).toBe(5000000);
      expect(matrix.columnTotals['v-hr']).toBe(3000000);
      expect(matrix.columnTotals['UNASSIGNED']).toBe(2000000);
      expect(matrix.grandTotal).toBe(10000000);
    });
  });
});
