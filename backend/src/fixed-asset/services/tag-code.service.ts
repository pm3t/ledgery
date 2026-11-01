import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Service untuk mengelola kode label / tag (tagCode) aset tetap.
 * Menjamin keunikan kode tag per tenant, format penomoran tag,
 * dan memastikan kode tag tidak pernah dipakai ulang bahkan untuk aset yang sudah dijual/dihapuskan.
 */
@Injectable()
export class TagCodeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Menghasilkan atau memvalidasi tagCode untuk aset baru.
   * Jika caller menyertakan tagCode eksternal, validasi keunikan per tenant.
   * Jika tidak ada, buat secara otomatis berdasarkan SubledgerSetting (tagCodeFormat & tagCodePrefix).
   */
  async generateOrValidateTagCode(
    tenantId: string,
    noAset: string,
    externalTagCode?: string,
  ): Promise<string> {
    if (externalTagCode && externalTagCode.trim()) {
      const clean = externalTagCode.trim();
      await this.validateTagCodeUnique(tenantId, clean);
      return clean;
    }

    // Ambil konfigurasi subledger tenant
    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    const prefix = setting?.tagCodePrefix?.trim() || '';
    const format = setting?.tagCodeFormat?.trim() || '{NO_ASET}';

    let generated = format
      .replace('{NO_ASET}', noAset)
      .replace('{PREFIX}', prefix);

    // Jika format tidak memuat {NO_ASET}, tambahkan nomor aset agar selalu unik
    if (!format.includes('{NO_ASET}')) {
      generated = prefix ? `${prefix}-${noAset}` : noAset;
    }

    // Pastikan hasil generate belum pernah digunakan
    const existing = await this.prisma.fixedAsset.findUnique({
      where: { tenantId_tagCode: { tenantId, tagCode: generated } },
    });

    if (existing) {
      // Fallback unik jika ada benturan tak terduga
      generated = `${generated}-${Date.now().toString().slice(-4)}`;
    }

    return generated;
  }

  /**
   * Validasi keunikan kode tag dalam tenant.
   * Aset berstatus DRAFT, AKTIF, DISUSUTKAN_PENUH, DIJUAL, maupun DIHAPUSKAN tetap memegang hak unik atas tagCode.
   */
  async validateTagCodeUnique(
    tenantId: string,
    tagCode: string,
    excludeAssetId?: string,
  ): Promise<void> {
    const existing = await this.prisma.fixedAsset.findUnique({
      where: { tenantId_tagCode: { tenantId, tagCode } },
    });

    if (existing && existing.id !== excludeAssetId) {
      throw new ConflictException(
        `Kode tag "${tagCode}" sudah digunakan oleh aset (${existing.noAset} - ${existing.nama}). Kode label aset bersifat permanen dan tidak boleh dipakai ulang.`,
      );
    }
  }

  /**
   * Mendapatkan awalan tenant untuk dimasukkan ke dalam konten QR/Barcode.
   * HANYA memuat identitas tenant + kode tag tanpa informasi finansial atau sensitif.
   */
  async getTenantPrefix(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nama_perusahaan: true },
    });

    if (!tenant?.nama_perusahaan) {
      return tenantId.slice(0, 8).toUpperCase();
    }

    // Ambil inisial atau 6 karakter alfanumerik nama perusahaan
    const clean = tenant.nama_perusahaan
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6);

    return clean || 'LDG';
  }
}

