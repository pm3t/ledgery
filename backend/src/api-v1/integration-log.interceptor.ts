import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Interceptor untuk mencatat setiap request masuk ke API publik (misal v1).
 * Mencatat log ke tabel IntegrationLog (termasuk body request secara ringkas).
 */
@Injectable()
export class IntegrationLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    // Data request yang akan dicatat
    const tenantId = req.tenantId || req.body?.tenantId || 'UNKNOWN';
    // Label API Key dari ApiKeyGuard jika lolos autentikasi
    const apiKeyId = req.apiKeyLabel || null; 
    const endpoint = `${req.method} ${req.url}`;
    
    // Ambil string versi api dari URL, misal /v1/...
    const urlParts = req.url.split('/');
    const versi_api = urlParts.find(p => p.startsWith('v')) || 'unknown';

    // Buat payload ringkas (potong max 500 karakter agar database aman)
    let payloadRingkas = '{}';
    if (req.body) {
      const stringified = JSON.stringify(req.body);
      payloadRingkas = stringified.length > 500 ? stringified.substring(0, 500) + '...' : stringified;
    }

    return next.handle().pipe(
      tap(() => {
        // Jika request sukses (masuk ke tap)
        this.logToDatabase(tenantId, apiKeyId, endpoint, versi_api, res.statusCode, payloadRingkas);
      }),
      catchError((error) => {
        // Jika request error (masuk ke catchError)
        const statusCode = error instanceof HttpException ? error.getStatus() : 500;
        this.logToDatabase(tenantId, apiKeyId, endpoint, versi_api, statusCode, payloadRingkas);
        return throwError(() => error);
      }),
    );
  }

  private async logToDatabase(
    tenantId: string,
    apiKeyId: string | null,
    endpoint: string,
    versi_api: string,
    statusCode: number,
    payload_ringkas: string
  ) {
    // Hindari error jika tenantId invalid/unknown (foreign key constraint)
    // Untuk log yang gagal auth, mungkin tidak ada tenantId. Kita skip log database 
    // jika tenantId benar-benar tidak valid (karena FK constraint). 
    // Dalam MVP, kita catat jika ada tenantId.
    if (tenantId !== 'UNKNOWN') {
      try {
        await this.prisma.integrationLog.create({
          data: {
            tenantId,
            apiKeyId,
            endpoint,
            versi_api,
            statusCode,
            payload_ringkas,
          },
        });
      } catch (err) {
        console.error('Gagal mencatat Integration Log:', err.message);
      }
    }
  }
}
