import { Test, TestingModule } from '@nestjs/testing';
import { TagCodeService } from './services/tag-code.service';
import { AssetLabelService } from './services/asset-label.service';
import { AssetScanService } from './services/asset-scan.service';
import { AssetLifecycleService } from './services/asset-lifecycle.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeAssetForRole } from './services/asset-serializer';
import {
  AssetLabelStatus,
  FixedAssetStatus,
  VerificationSessionStatus,
  VerificationScanResult,
  LabelSymbology,
} from '@prisma/client';
import { ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('Modul 24: Barcode Labelling & Reading pada Aset Tetap', () => {
  let tagCodeService: TagCodeService;
  let labelService: AssetLabelService;
  let scanService: AssetScanService;
  let prismaMock: any;
  let lifecycleServiceMock: any;
  let numberingServiceMock: any;

  const mockTenantId = 'tenant-test-123';
  const otherTenantId = 'tenant-other-999';

  beforeEach(async () => {
    prismaMock = {
      fixedAsset: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      subledgerSetting: {
        findUnique: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
      assetLabelTemplate: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      assetLabelPrintLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      assetVerificationSession: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assetVerificationScan: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      assetDisposal: {
        create: jest.fn(),
      },
    };

    lifecycleServiceMock = {
      transferAsset: jest.fn(),
    };

    numberingServiceMock = {
      getNextNumber: jest.fn().mockResolvedValue('FA-VER-202611-0001'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagCodeService,
        AssetLabelService,
        AssetScanService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AssetLifecycleService, useValue: lifecycleServiceMock },
        { provide: DocumentNumberingService, useValue: numberingServiceMock },
      ],
    }).compile();

    tagCodeService = module.get<TagCodeService>(TagCodeService);
    labelService = module.get<AssetLabelService>(AssetLabelService);
    scanService = module.get<AssetScanService>(AssetScanService);
  });

  describe('1. TagCodeService: Keunikan & Format', () => {
    it('harus menolak tagCode yang sudah digunakan termasuk milik aset yang sudah dijual/dihapuskan', async () => {
      prismaMock.fixedAsset.findUnique.mockResolvedValue({
        id: 'asset-old-1',
        noAset: 'FA-001',
        nama: 'Laptop Kantor',
        status: FixedAssetStatus.DIJUAL,
        tagCode: 'TAG-OLD-01',
      });

      await expect(
        tagCodeService.validateTagCodeUnique(mockTenantId, 'TAG-OLD-01'),
      ).rejects.toThrow(ConflictException);
    });

    it('harus memvalidasi keunikan tagCode dari luar (API)', async () => {
      prismaMock.fixedAsset.findUnique.mockResolvedValueOnce({
        id: 'asset-existing',
        noAset: 'FA-002',
        nama: 'Kendaraan Truk',
        status: FixedAssetStatus.DIHAPUSKAN,
        tagCode: 'EXT-TAG-99',
      });

      await expect(
        tagCodeService.generateOrValidateTagCode(mockTenantId, 'FA-003', 'EXT-TAG-99'),
      ).rejects.toThrow(ConflictException);

      prismaMock.fixedAsset.findUnique.mockResolvedValueOnce(null);
      const validTag = await tagCodeService.generateOrValidateTagCode(
        mockTenantId,
        'FA-003',
        'EXT-TAG-UNIQUE',
      );
      expect(validTag).toBe('EXT-TAG-UNIQUE');
    });

    it('harus membuat default tagCode mengikuti SubledgerSetting', async () => {
      prismaMock.subledgerSetting.findUnique.mockResolvedValue({
        tagCodeFormat: '{PREFIX}-{NO_ASET}',
        tagCodePrefix: 'AST',
      });
      prismaMock.fixedAsset.findUnique.mockResolvedValue(null);

      const generated = await tagCodeService.generateOrValidateTagCode(mockTenantId, 'FA-202611-0010');
      expect(generated).toBe('AST-FA-202611-0010');
    });
  });

  describe('2. Serializer Berbasis Peran: PETUGAS_ASET', () => {
    it('harus menghapus SEMUA field finansial di sisi server untuk peran PETUGAS_ASET', () => {
      const fullAsset = {
        id: 'asset-123',
        noAset: 'FA-100',
        tagCode: 'TAG-100',
        nama: 'Mesin Genset',
        status: FixedAssetStatus.AKTIF,
        hargaPerolehan: 150000000,
        hargaPerolehanAsli: 150000000,
        kurs: 1,
        mata_uang: 'IDR',
        nilaiResidu: 10000000,
        nilaiResiduNominal: 10000000,
        nilaiResiduPersen: 6.67,
        akumulasiKomersial: 30000000,
        akumulasiFiskal: 25000000,
        nilaiTercatat: 120000000,
        nilaiSisaBukuFiskal: 125000000,
        fiskalSisaBuku: 125000000,
        fiskalLabaRugi: 0,
        journalId: 'journal-xyz',
        category: {
          id: 'cat-1',
          nama: 'Peralatan Pabrik',
          akunAset: '1-1001',
          akunAkumulasi: '1-1002',
          akunBeban: '5-1001',
        },
      };

      const sanitized = serializeAssetForRole(fullAsset, 'PETUGAS_ASET');

      // Field operasional fisik tetap ada
      expect(sanitized.id).toBe('asset-123');
      expect(sanitized.noAset).toBe('FA-100');
      expect(sanitized.tagCode).toBe('TAG-100');
      expect(sanitized.nama).toBe('Mesin Genset');
      expect(sanitized.category.nama).toBe('Peralatan Pabrik');

      // SEMUA field finansial harus terhapus
      expect(sanitized.hargaPerolehan).toBeUndefined();
      expect(sanitized.hargaPerolehanAsli).toBeUndefined();
      expect(sanitized.nilaiResidu).toBeUndefined();
      expect(sanitized.akumulasiKomersial).toBeUndefined();
      expect(sanitized.akumulasiFiskal).toBeUndefined();
      expect(sanitized.nilaiTercatat).toBeUndefined();
      expect(sanitized.nilaiSisaBukuFiskal).toBeUndefined();
      expect(sanitized.journalId).toBeUndefined();
      expect(sanitized.category.akunAset).toBeUndefined();
      expect(sanitized.category.akunAkumulasi).toBeUndefined();
    });

    it('peran selain PETUGAS_ASET tetap mendapatkan field finansial lengkap', () => {
      const fullAsset = {
        id: 'asset-123',
        nama: 'Mesin Genset',
        hargaPerolehan: 150000000,
        nilaiTercatat: 120000000,
      };

      const result = serializeAssetForRole(fullAsset, 'ADMIN');
      expect(result.hargaPerolehan).toBe(150000000);
      expect(result.nilaiTercatat).toBe(120000000);
    });
  });

  describe('3. Cetak Label & Transisi Status', () => {
    it('harus menolak cetak ulang tanpa alasan jika ada aset yang sudah berstatus TERCETAK/TERPASANG', async () => {
      prismaMock.assetLabelTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        nama: 'Label 50x25',
        lebarMm: 50,
        tinggiMm: 25,
        simbologi: LabelSymbology.QR,
      });

      prismaMock.fixedAsset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          noAset: 'FA-01',
          tagCode: 'TAG-01',
          nama: 'Laptop',
          status: FixedAssetStatus.AKTIF,
          statusLabel: AssetLabelStatus.TERCETAK, // Sudah pernah dicetak
        },
      ]);

      await expect(
        labelService.renderLabelsPdf(
          mockTenantId,
          { templateId: 'tmpl-1', assetIds: ['asset-1'] },
          { id: 'user-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('harus menolak cetak label untuk aset yang masih berstatus CIP (konstruksi)', async () => {
      prismaMock.assetLabelTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        lebarMm: 50,
        tinggiMm: 25,
        simbologi: LabelSymbology.QR,
      });

      prismaMock.fixedAsset.findMany.mockResolvedValue([
        {
          id: 'asset-cip',
          noAset: 'CIP-01',
          tagCode: 'TAG-CIP',
          nama: 'Gedung Pabrik Tahap 1',
          status: FixedAssetStatus.CIP,
          statusLabel: AssetLabelStatus.BELUM_DILABEL,
        },
      ]);

      await expect(
        labelService.renderLabelsPdf(
          mockTenantId,
          { templateId: 'tmpl-1', assetIds: ['asset-cip'] },
          { id: 'user-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('harus sukses merender PDF label dan memperbarui statusLabel menjadi TERCETAK', async () => {
      prismaMock.assetLabelTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        lebarMm: 50,
        tinggiMm: 25,
        simbologi: LabelSymbology.QR,
        layout: { showCompany: true, showAssetName: true },
      });

      prismaMock.fixedAsset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          noAset: 'FA-01',
          tagCode: 'TAG-01',
          nama: 'Printer Kantor',
          status: FixedAssetStatus.AKTIF,
          statusLabel: AssetLabelStatus.BELUM_DILABEL,
        },
      ]);

      prismaMock.tenant.findUnique.mockResolvedValue({
        nama_perusahaan: 'PT Ledgery Sejahtera',
      });

      const res = await labelService.renderLabelsPdf(
        mockTenantId,
        { templateId: 'tmpl-1', assetIds: ['asset-1'] },
        { id: 'user-1', nama: 'Budi' },
      );

      expect(res.count).toBe(1);
      expect(res.pdfBuffer).toBeInstanceOf(Buffer);
      expect(prismaMock.fixedAsset.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['asset-1'] }, tenantId: mockTenantId },
        data: { statusLabel: AssetLabelStatus.TERCETAK },
      });
      expect(prismaMock.assetLabelPrintLog.create).toHaveBeenCalled();
    }, 15000);
  });

  describe('4. Pembacaan (Scan) & Isolasi Tenant', () => {
    it('harus menjawab "tidak terdaftar" jika kode tag milik tenant lain atau tidak dikenal', async () => {
      // Kueri mencari dengan tenantId mockTenantId, tetapi aset berada di tenant lain
      prismaMock.fixedAsset.findFirst.mockResolvedValue(null);

      const res = await scanService.resolveTag(mockTenantId, 'TAG-SECRET-OTHER');
      expect(res.found).toBe(false);
      expect(res.message).toContain('tidak terdaftar');
    });

    it('harus mentransisikan status label dari TERCETAK menjadi TERPASANG saat scan pertama', async () => {
      const asset = {
        id: 'asset-first-scan',
        noAset: 'FA-99',
        tagCode: 'TAG-99',
        nama: 'Meja Rapat',
        status: FixedAssetStatus.AKTIF,
        statusLabel: AssetLabelStatus.TERCETAK,
      };

      prismaMock.fixedAsset.findFirst.mockResolvedValue(asset);

      const res = await scanService.resolveTag(mockTenantId, 'TAG-99');
      expect(res.found).toBe(true);
      expect(prismaMock.fixedAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-first-scan' },
        data: { statusLabel: AssetLabelStatus.TERPASANG },
      });
    });
  });

  describe('5. Sesi Verifikasi Fisik (Stock Opname Aset)', () => {
    it('harus mengabaikan pemindaian ganda untuk aset yang sama dalam sesi', async () => {
      prismaMock.assetVerificationSession.findFirst.mockResolvedValue({
        id: 'session-1',
        tenantId: mockTenantId,
        status: VerificationSessionStatus.BERLANGSUNG,
      });

      prismaMock.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        tagCode: 'TAG-01',
        noAset: 'FA-01',
        nama: 'AC Kantor',
        statusLabel: AssetLabelStatus.TERPASANG,
        dimensions: { costCenter: 'CC-01' },
      });

      // Sudah ada scan sebelumnya di sesi ini
      prismaMock.assetVerificationScan.findUnique.mockResolvedValue({
        id: 'scan-exist',
        sessionId: 'session-1',
        assetId: 'asset-1',
        hasil: VerificationScanResult.DITEMUKAN,
      });

      const res = await scanService.scanInSession(
        mockTenantId,
        'session-1',
        { tagCode: 'TAG-01' },
        { id: 'user-1' },
      );

      expect(res.alreadyScanned).toBe(true);
      expect(prismaMock.assetVerificationScan.create).not.toHaveBeenCalled();
    });

    it('harus mendeteksi LOKASI_BERBEDA jika dimensi lokasi aset berbeda dengan lokasi pemindaian', async () => {
      prismaMock.assetVerificationSession.findFirst.mockResolvedValue({
        id: 'session-1',
        tenantId: mockTenantId,
        status: VerificationSessionStatus.BERLANGSUNG,
        cakupan: {},
      });

      prismaMock.fixedAsset.findFirst.mockResolvedValue({
        id: 'asset-moved',
        tagCode: 'TAG-MOVED',
        noAset: 'FA-02',
        nama: 'Proyektor Ruang Rapat',
        dimensions: { location: 'LANTAI-1' },
      });

      prismaMock.assetVerificationScan.findUnique.mockResolvedValue(null);
      prismaMock.assetVerificationScan.create.mockImplementation((args: any) => ({
        id: 'scan-new',
        ...args.data,
      }));

      const res = await scanService.scanInSession(
        mockTenantId,
        'session-1',
        { tagCode: 'TAG-MOVED', lokasiSesi: { location: 'LANTAI-3' } },
        { id: 'user-1' },
      );

      expect(res.hasil).toBe(VerificationScanResult.LOKASI_BERBEDA);
    });

    it('harus menolak pemindaian pada sesi yang telah DITUTUP', async () => {
      prismaMock.assetVerificationSession.findFirst.mockResolvedValue({
        id: 'session-closed',
        tenantId: mockTenantId,
        status: VerificationSessionStatus.DITUTUP,
      });

      await expect(
        scanService.scanInSession(
          mockTenantId,
          'session-closed',
          { tagCode: 'TAG-01' },
          { id: 'user-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('penutupan sesi harus menghitung BELUM_DITEMUKAN dan membekukan snapshot hasil', async () => {
      prismaMock.assetVerificationSession.findFirst.mockResolvedValue({
        id: 'session-to-close',
        tenantId: mockTenantId,
        status: VerificationSessionStatus.BERLANGSUNG,
        cakupan: { categories: ['cat-1'] },
        scans: [
          { assetId: 'asset-scanned-1', hasil: VerificationScanResult.DITEMUKAN },
          { assetId: 'asset-scanned-2', hasil: VerificationScanResult.LOKASI_BERBEDA },
        ],
      });

      // Kueri aset dalam cakupan (ada 3 aset, hanya 2 yang dipindai)
      prismaMock.fixedAsset.findMany.mockResolvedValue([
        { id: 'asset-scanned-1', noAset: 'FA-01', tagCode: 'TAG-01' },
        { id: 'asset-scanned-2', noAset: 'FA-02', tagCode: 'TAG-02' },
        { id: 'asset-missing-3', noAset: 'FA-03', tagCode: 'TAG-03', nama: 'Server Rack' },
      ]);

      prismaMock.assetVerificationSession.update.mockImplementation((args: any) => ({
        id: 'session-to-close',
        ...args.data,
      }));

      const closed = await scanService.closeVerificationSession(
        mockTenantId,
        'session-to-close',
        { id: 'admin-1', nama: 'Admin' },
      );

      expect(closed.status).toBe(VerificationSessionStatus.DITUTUP);
      const snapshot = closed.snapshotHasil as any;
      expect(snapshot.ditemukan).toBe(1);
      expect(snapshot.lokasiBerbeda).toBe(1);
      expect(snapshot.belumDitemukan).toBe(1);
      expect(snapshot.missingAssetList[0].id).toBe('asset-missing-3');
    });

    it('tindak lanjut perbaikan lokasi harus memanggil transferAsset tanpa membuat jurnal GL', async () => {
      prismaMock.assetVerificationSession.findFirst.mockResolvedValue({
        id: 'session-1',
        tenantId: mockTenantId,
        scans: [
          {
            assetId: 'asset-moved',
            hasil: VerificationScanResult.LOKASI_BERBEDA,
            lokasiSesi: { location: 'LANTAI-3' },
          },
        ],
      });

      lifecycleServiceMock.transferAsset.mockResolvedValue({
        id: 'transfer-doc-1',
        noDokumen: 'TRF-001',
      });

      const res = await scanService.applyLocationUpdates(
        mockTenantId,
        'session-1',
        {},
        { id: 'admin-1', nama: 'Admin' },
      );

      expect(res.successCount).toBe(1);
      expect(lifecycleServiceMock.transferAsset).toHaveBeenCalledWith(
        mockTenantId,
        'asset-moved',
        expect.objectContaining({ ke: { location: 'LANTAI-3' } }),
        'Admin',
      );
    });
  });
});
