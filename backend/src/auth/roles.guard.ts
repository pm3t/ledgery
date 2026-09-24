import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * RolesGuard membaca role dari JWT payload (req.user.role).
 * Guard ini WAJIB digunakan bersama JwtAuthGuard.
 * 
 * Contoh penggunaan:
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('SUPER_ADMIN')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) {
      return true; // Endpoint tidak memerlukan role khusus
    }

    const request = context.switchToHttp().getRequest();

    // Ambil role dari JWT payload (set oleh JwtStrategy)
    const user = request.user;
    
    // Fallback ke X-User-Role header untuk kompatibilitas backward (Super Admin mock)
    const userRole = user?.role || request.headers['x-user-role'];

    if (!userRole || !roles.includes(userRole)) {
      throw new ForbiddenException(`Akses ditolak! Endpoint ini memerlukan role: ${roles.join(', ')}`);
    }

    return true;
  }
}
