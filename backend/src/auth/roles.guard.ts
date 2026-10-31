import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * RolesGuard membaca role dari JWT payload (req.user.role).
 * Guard ini WAJIB digunakan bersama JwtAuthGuard.
 * 
 * Pengendalian Hak Akses:
 * - Jika rute memiliki anotasi @Roles(...), role pemanggil harus cocok dengan salah satu role yang diizinkan.
 * - Peran khusus PETUGAS_ASET (Modul V4) hanya boleh mengakses rute yang eksplisit mengizinkan PETUGAS_ASET
 *   (pemindaian QR, verifikasi fisik, dan melihat daftar aset). Pada endpoint non-aset/finansial, PETUGAS_ASET otomatis ditolak.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();

    // Ambil role dari JWT payload (set oleh JwtStrategy)
    const user = request.user;
    
    // Fallback ke X-User-Role header untuk kompatibilitas backward (Super Admin mock)
    const userRole = user?.role || request.headers['x-user-role'];

    // Pembatasan ketat untuk PETUGAS_ASET:
    // Hanya dapat mengakses rute yang secara eksplisit memasukkan 'PETUGAS_ASET' dalam dekorator @Roles
    if (userRole === 'PETUGAS_ASET') {
      if (!roles || !roles.includes('PETUGAS_ASET')) {
        throw new ForbiddenException(
          'Akses ditolak! Peran PETUGAS_ASET hanya memiliki izin untuk melihat aset, pemindaian QR/Barcode, dan verifikasi fisik.',
        );
      }
      return true;
    }

    if (!roles) {
      return true; // Endpoint umum tidak memerlukan role khusus
    }

    if (!userRole || !roles.includes(userRole)) {
      throw new ForbiddenException(`Akses ditolak! Endpoint ini memerlukan role: ${roles.join(', ')}`);
    }

    return true;
  }
}
