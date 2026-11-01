import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TagCodeService } from './tag-code.service';
import { AssetLifecycleService } from './asset-lifecycle.service';
import { DocumentNumberingService, SubledgerDocType } from '../../subledger/document-numbering.service';
import { serializeAssetForRole } from './asset-serializer';
import {
  CreateVerificationSessionDto,
  ScanItemDto,
  BatchScanVerificationDto,
  ApplyLocationUpdateDto,
  DraftDisposalForNotFoundDto,
} from '../dto/asset-scan.dto';
import {
  AssetLabelStatus,
  FixedAssetStatus,
  VerificationSessionStatus,
  VerificationScanResult,
  AssetDisposalType,
  AssetDisposalStatus,
} from '@prisma/client';

@Injectable()
export class AssetScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagCodeService: TagCodeService,
    private readonly lifecycleService: AssetLifecycleService,
    private readonly numberingService: DocumentNumberingService,
  ) {}

  /**
   * Resolusi kode tag menjadi kartu aset.
   * Aturan keamanan & privasi:
   * - HANYA mencari dalam tenant pengguna / API key.
   * - Kode milik tenant lain atau tidak dikenal SELALU dijawab "tidak terdaftar" tanpa membocorkan keberadaannya.
   * - Status label otomatis bertransisi dari TERCETAK menjadi TERPASANG pada scan pertama.
   * - Serializer berbasis peran: untuk PETUGAS_ASET, SEMUA field finansial dihapus di sisi server.
   */
  async resolveTag(
    tenantId: string,
    rawTagCode: string,
    userRole?: string,
  ): Promise<{ found: boolean; asset?: any; message?: string }> {
    if (!rawTagCode || !rawTagCode.trim()) {
      throw new BadRequestException('Kode tag tidak boleh kosong.');
    }

    // Bersihkan awalan tenant jika ada format PREFIKS:TAGCODE
    let cleanTag = rawTagCode.trim();
    if (cleanTag.includes(':')) {
      const parts = cleanTag.split(':');
      cleanTag = parts[parts.length - 1].trim();
    }

    // Cari aset secara ketat dalam tenantId
    const asset = await this.prisma.fixedAsset.findFirst({
      where: {
        tenantId,
        tagCode: cleanTag,
      },
      include: {
        category: true,
      },
    });

    if (!asset) {
      return {
        found: false,
        message: 'Kode tag tidak terdaftar dalam sistem tenant ini.',
      };
    }

    // Transisi otomatis status label: TERCETAK -> TERPASANG pada pemindaian pertama
    if (asset.statusLabel === AssetLabelStatus.TERCETAK) {
      await this.prisma.fixedAsset.update({
        where: { id: asset.id },
        data: { statusLabel: AssetLabelStatus.TERPASANG },
      });
      asset.statusLabel = AssetLabelStatus.TERPASANG;
    }

    // Serializer berbasis peran
    const serialized = serializeAssetForRole(asset, userRole);

    return {
      found: true,
      asset: serialized,
    };
  }

  /**
   * Konfirmasi manual label telah terpasang pada fisik aset
   */
  async confirmLabelInstalled(tenantId: string, assetId: string, user: { id: string; nama?: string }) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
    });
    if (!asset) throw new NotFoundException('Aset tidak ditemukan.');

    const updated = await this.prisma.fixedAsset.update({
      where: { id: assetId },
      data: { statusLabel: AssetLabelStatus.TERPASANG },
    });

    return { success: true, statusLabel: updated.statusLabel };
  }

  /**
   * Laporkan label rusak atau hilang
   */
  async reportLabelDamagedLost(tenantId: string, assetId: string, alasan: string, user: { id: string; nama?: string }) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, tenantId },
    });
    if (!asset) throw new NotFoundException('Aset tidak ditemukan.');

    const updated = await this.prisma.fixedAsset.update({
      where: { id: assetId },
      data: { statusLabel: AssetLabelStatus.RUSAK_HILANG },
    });

    return { success: true, statusLabel: updated.statusLabel };
  }

  // =========================================================================
  // SESI VERIFIKASI FISIK ASET (STOCK OPNAME ASET)
  // =========================================================================

  /**
   * Membuat sesi verifikasi fisik baru
   */
  async createVerificationSession(
    tenantId: string,
    dto: CreateVerificationSessionDto,
    user: { id: string; nama?: string },
  ) {
    const noDokumen = await this.generateVerificationDocNumber(tenantId);

    const session = await this.prisma.assetVerificationSession.create({
      data: {
        tenantId,
        noDokumen,
        nama: dto.nama,
        tanggal: new Date(dto.tanggal),
        cakupan: dto.cakupan || {},
        status: VerificationSessionStatus.BERLANGSUNG,
        createdBy: user.nama || user.id || 'User',
      },
    });

    return session;
  }

  /**
   * Mengambil daftar sesi verifikasi
   */
  async getVerificationSessions(tenantId: string, status?: VerificationSessionStatus) {
    return this.prisma.assetVerificationSession.findMany({
      where: {
        tenantId,
        ...(status && { status }),
      },
      orderBy: { tanggal: 'desc' },
      include: {
        _count: {
          select: { scans: true },
        },
      },
    });
  }

  /**
   * Mengambil rincian sesi verifikasi beserta daftar hasil pemindaian
   */
  async getVerificationSessionById(tenantId: string, id: string, userRole?: string) {
    const session = await this.prisma.assetVerificationSession.findFirst({
      where: { id, tenantId },
      include: {
        scans: {
          include: {
            asset: {
              include: { category: true },
            },
          },
          orderBy: { scannedAt: 'desc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sesi verifikasi fisik tidak ditemukan.');
    }

    // Serialize aset pada setiap scan berdasarkan role
    const sanitizedScans = session.scans.map((s) => ({
      ...s,
      asset: s.asset ? serializeAssetForRole(s.asset, userRole) : null,
    }));

    return {
      ...session,
      scans: sanitizedScans,
    };
  }

  /**
   * Memproses satu pemindaian dalam sesi verifikasi fisik
   */
  async scanInSession(
    tenantId: string,
    sessionId: string,
    scanData: ScanItemDto,
    user: { id: string; nama?: string; role?: string },
  ) {
    const session = await this.prisma.assetVerificationSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException('Sesi verifikasi fisik tidak ditemukan.');
    }

    if (session.status === VerificationSessionStatus.DITUTUP) {
      throw new BadRequestException('Sesi verifikasi telah ditutup dan tidak menerima pemindaian baru.');
    }

    let cleanTag = scanData.tagCode.trim();
    if (cleanTag.includes(':')) {
      const parts = cleanTag.split(':');
      cleanTag = parts[parts.length - 1].trim();
    }

    // 1. Cari aset dalam tenant
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { tenantId, tagCode: cleanTag },
      include: { category: true },
    });

    if (!asset) {
      // Catat sebagai scan TIDAK_TERDAFTAR
      const scan = await this.prisma.assetVerificationScan.create({
        data: {
          sessionId,
          assetId: null,
          tagCodeScanned: cleanTag,
          hasil: VerificationScanResult.TIDAK_TERDAFTAR,
          lokasiSesi: scanData.lokasiSesi || null,
          device: scanData.device || null,
          scannedBy: user.nama || user.id || 'User',
        },
      });

      return {
        hasil: VerificationScanResult.TIDAK_TERDAFTAR,
        scan,
        message: 'Kode tag tidak terdaftar dalam sistem tenant ini.',
      };
    }

    // 2. Cek apakah aset sudah pernah dipindai dalam sesi ini (abaikan pemindaian ganda)
    const existingScan = await this.prisma.assetVerificationScan.findUnique({
      where: { sessionId_assetId: { sessionId, assetId: asset.id } },
    });

    if (existingScan) {
      return {
        hasil: existingScan.hasil,
        alreadyScanned: true,
        scan: existingScan,
        asset: serializeAssetForRole(asset, user.role),
        message: `Aset "${asset.noAset} - ${asset.nama}" sudah pernah dipindai pada sesi ini.`,
      };
    }

    // 3. Tentukan apakah lokasi aset sesuai dengan lokasi pemindaian / cakupan sesi
    const isLocationMatch = this.checkLocationMatch(asset.dimensions, scanData.lokasiSesi, session.cakupan);

    const hasil = isLocationMatch
      ? VerificationScanResult.DITEMUKAN
      : VerificationScanResult.LOKASI_BERBEDA;

    // 4. Rekam scan
    const scan = await this.prisma.assetVerificationScan.create({
      data: {
        sessionId,
        assetId: asset.id,
        tagCodeScanned: cleanTag,
        hasil,
        lokasiSesi: scanData.lokasiSesi || null,
        device: scanData.device || null,
        scannedBy: user.nama || user.id || 'User',
      },
    });

    // 5. Transisi status label: TERCETAK -> TERPASANG
    if (asset.statusLabel === AssetLabelStatus.TERCETAK) {
      await this.prisma.fixedAsset.update({
        where: { id: asset.id },
        data: { statusLabel: AssetLabelStatus.TERPASANG },
      });
      asset.statusLabel = AssetLabelStatus.TERPASANG;
    }

    return {
      hasil,
      scan,
      asset: serializeAssetForRole(asset, user.role),
      message:
        hasil === VerificationScanResult.DITEMUKAN
          ? `Aset "${asset.noAset} - ${asset.nama}" berhasil diverifikasi.`
          : `Aset "${asset.noAset} - ${asset.nama}" terverifikasi namun berada di lokasi berbeda.`,
    };
  }

  /**
   * Memproses sekumpulan pemindaian (batch scan) dalam sesi verifikasi
   */
  async batchScanInSession(
    tenantId: string,
    sessionId: string,
    dto: BatchScanVerificationDto,
    user: { id: string; nama?: string; role?: string },
  ) {
    const results: any[] = [];
    for (const item of dto.scans) {
      const res = await this.scanInSession(tenantId, sessionId, item, user);
      results.push(res);
    }
    return {
      totalProcessed: dto.scans.length,
      results,
    };
  }

  /**
   * Menutup sesi verifikasi fisik:
   * - Menghitung aset dalam cakupan yang BELUM_DITEMUKAN
   * - Membekukan snapshot hasil sesi
   * - Status menjadi DITUTUP (final)
   */
  async closeVerificationSession(
    tenantId: string,
    sessionId: string,
    user: { id: string; nama?: string },
  ) {
    const session = await this.prisma.assetVerificationSession.findFirst({
      where: { id: sessionId, tenantId },
      include: { scans: true },
    });

    if (!session) {
      throw new NotFoundException('Sesi verifikasi tidak ditemukan.');
    }

    if (session.status === VerificationSessionStatus.DITUTUP) {
      throw new BadRequestException('Sesi verifikasi ini sudah ditutup sebelumnya.');
    }

    // 1. Kueri semua aset dalam cakupan sesi yang aktif
    const cakupan = (session.cakupan as any) || {};
    const whereAssets: any = {
      tenantId,
      status: { in: [FixedAssetStatus.AKTIF, FixedAssetStatus.DISUSUTKAN_PENUH] },
    };

    if (cakupan.categories && cakupan.categories.length > 0) {
      whereAssets.categoryId = { in: cakupan.categories };
    }

    const allAssetsInScope = await this.prisma.fixedAsset.findMany({
      where: whereAssets,
      include: { category: true },
    });

    // Filter tambahan untuk lokasi / dimension jika cakupan menentukan dimensi
    const filteredAssetsInScope = allAssetsInScope.filter((a) => {
      if (!cakupan.locations || cakupan.locations.length === 0) return true;
      const dims = (a.dimensions as any) || {};
      const assetDimValues = Object.values(dims);
      return cakupan.locations.some((loc: any) => assetDimValues.includes(loc));
    });

    // 2. Petakan hasil pemindaian
    const scannedAssetIds = new Set(
      session.scans.filter((s) => s.assetId).map((s) => s.assetId as string),
    );

    const missingAssets = filteredAssetsInScope.filter(
      (a) => !scannedAssetIds.has(a.id),
    );

    const countDitemukan = session.scans.filter(
      (s) => s.hasil === VerificationScanResult.DITEMUKAN,
    ).length;
    const countLokasiBerbeda = session.scans.filter(
      (s) => s.hasil === VerificationScanResult.LOKASI_BERBEDA,
    ).length;
    const countTidakTerdaftar = session.scans.filter(
      (s) => s.hasil === VerificationScanResult.TIDAK_TERDAFTAR,
    ).length;

    // 3. Susun snapshot hasil final
    const snapshotHasil = {
      totalCakupan: filteredAssetsInScope.length,
      ditemukan: countDitemukan,
      lokasiBerbeda: countLokasiBerbeda,
      tidakTerdaftar: countTidakTerdaftar,
      belumDitemukan: missingAssets.length,
      missingAssetList: missingAssets.map((a) => ({
        id: a.id,
        noAset: a.noAset,
        tagCode: a.tagCode,
        nama: a.nama,
        categoryId: a.categoryId,
        kategori: a.category?.nama,
        dimensions: a.dimensions,
      })),
      closedAt: new Date().toISOString(),
      closedBy: user.nama || user.id || 'User',
    };

    // 4. Update status sesi menjadi DITUTUP
    const updated = await this.prisma.assetVerificationSession.update({
      where: { id: sessionId },
      data: {
        status: VerificationSessionStatus.DITUTUP,
        snapshotHasil,
        closedBy: user.nama || user.id || 'User',
        closedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Membuka kembali sesi yang telah ditutup.
   * HANYA diizinkan untuk Admin Tenant (Role ADMIN / SUPER_ADMIN).
   */
  async reopenVerificationSession(
    tenantId: string,
    sessionId: string,
    user: { id: string; nama?: string; role?: string },
  ) {
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Hanya Admin Tenant yang memiliki hak untuk membuka kembali sesi verifikasi yang telah ditutup.',
      );
    }

    const session = await this.prisma.assetVerificationSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException('Sesi verifikasi tidak ditemukan.');
    }

    if (session.status !== VerificationSessionStatus.DITUTUP) {
      throw new BadRequestException('Hanya sesi yang berstatus DITUTUP yang dapat dibuka kembali.');
    }

    return this.prisma.assetVerificationSession.update({
      where: { id: sessionId },
      data: {
        status: VerificationSessionStatus.BERLANGSUNG,
        closedBy: null,
        closedAt: null,
      },
    });
  }

  /**
   * Tindak Lanjut: Terapkan perbaikan lokasi untuk aset yang dipindai di lokasi berbeda.
   * Menggunakan AssetLifecycleService.transferAsset (Modul 23) yang menghasilkan AssetTransfer
   * dan AssetDimensionHistory TANPA jurnal GL.
   */
  async applyLocationUpdates(
    tenantId: string,
    sessionId: string,
    dto: ApplyLocationUpdateDto,
    user: { id: string; nama?: string },
  ) {
    const session = await this.prisma.assetVerificationSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        scans: {
          where: {
            hasil: VerificationScanResult.LOKASI_BERBEDA,
            assetId: { not: null },
          },
          include: { asset: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sesi verifikasi tidak ditemukan.');
    }

    const targets = session.scans.filter(
      (s) => !dto.assetIds || dto.assetIds.includes(s.assetId as string),
    );

    const results: any[] = [];

    for (const scan of targets) {
      if (!scan.assetId || !scan.lokasiSesi) continue;

      try {
        const transfer = await this.lifecycleService.transferAsset(
          tenantId,
          scan.assetId,
          {
            tanggal: new Date().toISOString().slice(0, 10),
            ke: scan.lokasiSesi,
            alasan: `Penyesuaian lokasi dari hasil verifikasi fisik (${session.noDokumen} - ${session.nama})`,
          },
          user?.nama || user?.id || 'User',
        );
        results.push({ assetId: scan.assetId, success: true, transferId: transfer.id });
      } catch (err: any) {
        results.push({ assetId: scan.assetId, success: false, error: err.message });
      }
    }

    return {
      totalRequested: targets.length,
      successCount: results.filter((r) => r.success).length,
      results,
    };
  }

  /**
   * Tindak Lanjut: Buat dokumen Penghapusan DRAFT untuk aset yang BELUM_DITEMUKAN.
   * Catatan PRD: Dokumen dibuat sebagai DRAFT dan TIDAK otomatis memposting jurnal GL.
   */
  async createDraftDisposalForNotFound(
    tenantId: string,
    sessionId: string,
    dto: DraftDisposalForNotFoundDto,
    user: { id: string; nama?: string },
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: dto.assetId, tenantId },
    });
    if (!asset) {
      throw new NotFoundException('Aset tidak ditemukan.');
    }

    // Nomor dokumen disposal baru
    const noDokumen = await this.numberingService.getNextNumber(
      tenantId,
      SubledgerDocType.ASSET_DISPOSAL,
    );

    const nilaiTercatat = Number(asset.nilaiTercatat);
    const fiskalSisaBuku = Number(asset.nilaiSisaBukuFiskal);

    // Buat AssetDisposal berstatus VOID atau DRAFT (disimpan sebagai draft penghapusan)
    const disposal = await this.prisma.assetDisposal.create({
      data: {
        tenantId,
        noDokumen,
        assetId: asset.id,
        tanggal: new Date(),
        tipe: AssetDisposalType.HAPUS,
        alasan: dto.alasan || `Diusulkan penghapusan akibat tidak ditemukan pada verifikasi fisik sesi ${sessionId}`,
        nilaiTercatatSaatPelepasan: nilaiTercatat,
        labaRugi: -nilaiTercatat,
        fiskalSisaBuku: fiskalSisaBuku,
        fiskalLabaRugi: -fiskalSisaBuku,
        status: AssetDisposalStatus.VOID, // Disimpan sebagai draft tanpa posting jurnal
        createdBy: user.nama || user.id || 'User',
      },
    });

    return {
      success: true,
      message: 'Draft usulan penghapusan aset berhasil dibuat untuk ditinjau oleh staf akuntansi.',
      disposal,
    };
  }

  // =========================================================================
  // HELPER INTERNAL
  // =========================================================================

  private checkLocationMatch(assetDimensions: any, scanLocation: any, sessionScope: any): boolean {
    if (!scanLocation && !sessionScope) return true;

    const aDim = assetDimensions || {};
    const sLoc = scanLocation || {};

    // Jika scanLocation menyertakan dimension id/value
    for (const key of Object.keys(sLoc)) {
      if (sLoc[key] && aDim[key] && sLoc[key] !== aDim[key]) {
        return false;
      }
    }

    // Jika cakupan sesi membatasi lokasi tertentu
    if (sessionScope?.locations && Array.isArray(sessionScope.locations) && sessionScope.locations.length > 0) {
      const aDimValues = Object.values(aDim);
      const inScope = sessionScope.locations.some((loc: any) => aDimValues.includes(loc));
      if (!inScope) return false;
    }

    return true;
  }

  private async generateVerificationDocNumber(tenantId: string): Promise<string> {
    try {
      return await this.numberingService.getNextNumber(tenantId, SubledgerDocType.ASSET);
    } catch {
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const rand = Math.floor(1000 + Math.random() * 9000);
      return `FA-VER-${yr}${mo}-${rand}`;
    }
  }
}

