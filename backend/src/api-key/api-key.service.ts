import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateApiKeyDto } from './dto/generate-api-key.dto';

// Service untuk mengelola API Key per Tenant
@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  // Membuat API key baru: simpan hash ke DB dan kembalikan plaintext HANYA SEKALI
  async generateKey(generateApiKeyDto: GenerateApiKeyDto) {
    const { tenantId, nama_label } = generateApiKeyDto;

    // Memastikan tenant terdaftar
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant dengan ID ${tenantId} tidak ditemukan`);
    }

    // 1. Generate Plaintext Key yang aman (format: ldg_live_<random_bytes>)
    const randomHex = crypto.randomBytes(24).toString('hex');
    const rawApiKey = `ldg_live_${randomHex}`;

    // 2. Hash sha256 dari API key sebelum disimpan ke database
    const key_hash = crypto
      .createHash('sha256')
      .update(rawApiKey)
      .digest('hex');

    // 3. Simpan hash ke database
    const apiKeyRecord = await this.prisma.apiKey.create({
      data: {
        tenantId,
        key_hash,
        nama_label,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        nama_label: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    // 4. Kembalikan record beserta plaintext API key (tampil sekali saja!)
    return {
      ...apiKeyRecord,
      rawApiKey, // Tampil sekali untuk dikopi oleh pengguna!
    };
  }

  // Mengambil daftar API Key per tenant (tanpa menampilkan hash sensitif)
  async findByTenant(tenantId: string) {
    return this.prisma.apiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        nama_label: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Melakukan penarikan / penghentian (revoke) API key
  async revokeKey(id: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw new NotFoundException(`API Key dengan ID ${id} tidak ditemukan`);
    }

    return this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        tenantId: true,
        nama_label: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  // Menghapus record API key secara permanen jika diperlukan
  async removeKey(id: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw new NotFoundException(`API Key dengan ID ${id} tidak ditemukan`);
    }

    return this.prisma.apiKey.delete({
      where: { id },
    });
  }
}
