import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // Login: validasi email+password, return JWT
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Email atau password tidak valid');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Akun Anda telah dinonaktifkan. Hubungi Administrator.');
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Email atau password tidak valid');
    }

    // Update waktu login terakhir
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      nama: user.nama,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  // Refresh token: verifikasi refresh token, berikan access token baru
  async refreshToken(token: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid atau sudah kadaluarsa');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token jenis tidak valid');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException('User tidak ditemukan atau sudah tidak aktif');
    }

    const newPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      nama: user.nama,
    };

    const accessToken = this.jwtService.sign(newPayload, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    return { accessToken };
  }

  // Forgot password: generate token reset, simpan di DB, "kirim" via console (MVP)
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Kembalikan sukses meski email tidak ditemukan (security best practice)
      return { message: 'Jika email terdaftar, link reset akan dikirimkan.' };
    }

    // Hapus token lama yang belum digunakan
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, isUsed: false },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 jam

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    // MVP: Tampilkan link ke console (produksi: kirim via email SMTP)
    const resetLink = `http://localhost:3000/reset-password?token=${token}`;
    console.log(`\n📧 [DEV] Link Reset Password untuk ${email}:\n${resetLink}\n`);

    return {
      message: 'Jika email terdaftar, link reset akan dikirimkan.',
      // Hanya tampilkan token di dev environment
      ...(process.env.NODE_ENV !== 'production' && { devToken: token }),
    };
  }

  // Reset password: validasi token, update password
  async resetPassword(token: string, newPassword: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.isUsed || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Token reset password tidak valid atau sudah kadaluarsa');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      // Update password user
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password_hash: passwordHash },
      }),
      // Tandai token sudah digunakan
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { isUsed: true },
      }),
    ]);

    return { message: 'Password berhasil diperbarui. Silakan login kembali.' };
  }

  // Validasi JWT token (digunakan oleh frontend untuk verifikasi sesi)
  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      return { valid: true, payload };
    } catch {
      return { valid: false };
    }
  }
}
