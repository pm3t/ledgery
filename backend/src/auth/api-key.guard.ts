import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// Guard untuk memvalidasi API Key pada header HTTP 'X-API-Key'
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Mengambil nilai API key dari header X-API-Key (case-insensitive)
    const rawApiKey =
      request.headers['x-api-key'] || request.headers['X-API-Key'];

    if (!rawApiKey) {
      throw new UnauthorizedException(
        'API Key tidak ditemukan pada header X-API-Key',
      );
    }

    // Melakukan hashing sha256 pada API key yang masuk untuk dicocokkan dengan database
    const hashedKey = crypto
      .createHash('sha256')
      .update(rawApiKey)
      .digest('hex');

    // Cari API key aktif di database berdasarkan key_hash
    const apiKeyRecord = await this.prisma.apiKey.findUnique({
      where: { key_hash: hashedKey },
      include: { tenant: true },
    });

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      throw new UnauthorizedException(
        'API Key tidak valid atau telah ditarik (revoked)',
      );
    }

    // Memperbarui timestamp lastUsedAt secara asynchronous tanpa menghambat request
    this.prisma.apiKey
      .update({
        where: { id: apiKeyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {
        // Mengabaikan error pembaruan timestamp agar request tetap berjalan
      });

    // Menempelkan informasi tenant dan apiKey ke dalam request object
    request['tenantId'] = apiKeyRecord.tenantId;
    request['tenant'] = apiKeyRecord.tenant;
    request['apiKeyLabel'] = apiKeyRecord.nama_label;

    return true;
  }
}
