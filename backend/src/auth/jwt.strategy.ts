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
      secretOrKey: process.env.JWT_SECRET || 'ledgery_secret',
    });
  }

  async validate(payload: JwtPayload) {
    // Validasi user masih ada dan aktif di database
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('Sesi tidak valid atau user telah dinonaktifkan');
    }

    // Kembalikan user ke request object (req.user)
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      nama: payload.nama,
    };
  }
}
