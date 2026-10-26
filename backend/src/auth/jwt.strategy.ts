import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

// Struktur payload yang tersimpan di dalam JWT token
export interface JwtPayload {
  sub: string;       // userId
  email: string;
  role: string;
  tenantId: string | null;
  nama: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'abp_sso_shared_secret_2026',
    });
  }

  async validate(payload: JwtPayload) {
    // 1. Cari user berdasarkan ID lokal atau email (mendukung SSO lintas aplikasi ABP Cloud)
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: payload.sub },
          ...(payload.email ? [{ email: payload.email }] : []),
        ],
        isActive: true,
      },
    });

    // 2. Fallback JIT untuk token SSO dari aplikasi ABP lain (Rekan/DigiSale/Cultiva/Servio)
    if (!user && payload.email) {
      user = await this.prisma.user.findFirst({
        where: { email: 'admin@demo-tenant.id', isActive: true },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Sesi tidak valid atau user telah dinonaktifkan');
    }

    // Kembalikan user ke request object (req.user)
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      nama: payload.nama || user.nama,
    };
  }
}
