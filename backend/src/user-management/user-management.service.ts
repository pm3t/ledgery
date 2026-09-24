import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

interface CreateUserDto {
  nama: string;
  email: string;
  password: string;
  role: UserRole;
  tenantId?: string | null;
}

interface UpdateUserDto {
  nama?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
}

@Injectable()
export class UserManagementService {
  constructor(private prisma: PrismaService) {}

  // List user berdasarkan role pemanggil
  async getUsers(callerRole: string, callerTenantId: string | null, filterTenantId?: string) {
    if (callerRole === 'SUPER_ADMIN') {
      // Super Admin bisa melihat semua user, dengan opsional filter per tenant
      return this.prisma.user.findMany({
        where: filterTenantId ? { tenantId: filterTenantId } : {},
        select: {
          id: true,
          nama: true,
          email: true,
          role: true,
          tenantId: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          tenant: { select: { nama_perusahaan: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Admin Tenant hanya bisa melihat staf di tenant-nya sendiri
    return this.prisma.user.findMany({
      where: {
        tenantId: callerTenantId,
        role: UserRole.STAF_AKUNTANSI,
      },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Buat user baru (dengan validasi eskalasi hak akses)
  async createUser(callerRole: string, callerTenantId: string | null, dto: CreateUserDto) {
    // Validasi: ADMIN_TENANT hanya boleh membuat STAF_AKUNTANSI
    if (callerRole === 'ADMIN_TENANT') {
      if (dto.role !== UserRole.STAF_AKUNTANSI) {
        throw new ForbiddenException('ADMIN_TENANT hanya diizinkan membuat akun STAF_AKUNTANSI');
      }
      // Paksa tenantId sesuai caller
      dto.tenantId = callerTenantId;
    }

    // STAF_AKUNTANSI tidak boleh membuat user
    if (callerRole === 'STAF_AKUNTANSI') {
      throw new ForbiddenException('Staf Akuntansi tidak memiliki hak untuk manajemen user');
    }

    // Validasi: user dengan role tenant WAJIB punya tenantId
    if (dto.role !== UserRole.SUPER_ADMIN && !dto.tenantId) {
      throw new BadRequestException('tenantId wajib diisi untuk role STAF_AKUNTANSI dan ADMIN_TENANT');
    }

    // Validasi: SUPER_ADMIN tidak boleh punya tenantId
    if (dto.role === UserRole.SUPER_ADMIN) {
      dto.tenantId = null;
    }

    // Cek duplikasi email
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email sudah terdaftar di sistem');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        nama: dto.nama,
        email: dto.email,
        password_hash: passwordHash,
        role: dto.role,
        tenantId: dto.tenantId || null,
        isActive: true,
      },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  // Update user (nama, email, password, status aktif)
  async updateUser(
    callerRole: string,
    callerTenantId: string | null,
    targetUserId: string,
    dto: UpdateUserDto,
  ) {
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new NotFoundException('User tidak ditemukan');

    // Admin Tenant hanya boleh update user di tenantnya sendiri dan hanya STAF_AKUNTANSI
    if (callerRole === 'ADMIN_TENANT') {
      if (targetUser.tenantId !== callerTenantId || targetUser.role !== UserRole.STAF_AKUNTANSI) {
        throw new ForbiddenException('Anda hanya bisa mengedit Staf Akuntansi di tenant Anda sendiri');
      }
    }

    const updateData: any = {};
    if (dto.nama) updateData.nama = dto.nama;
    if (dto.email) {
      // Cek duplikasi email
      const emailExists = await this.prisma.user.findFirst({
        where: { email: dto.email, id: { not: targetUserId } },
      });
      if (emailExists) throw new ConflictException('Email sudah digunakan oleh user lain');
      updateData.email = dto.email;
    }
    if (dto.password) {
      updateData.password_hash = await bcrypt.hash(dto.password, 12);
    }
    if (typeof dto.isActive === 'boolean') updateData.isActive = dto.isActive;

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  // Nonaktifkan user (soft delete)
  async deactivateUser(callerRole: string, callerTenantId: string | null, targetUserId: string) {
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new NotFoundException('User tidak ditemukan');

    if (callerRole === 'ADMIN_TENANT') {
      if (targetUser.tenantId !== callerTenantId || targetUser.role !== UserRole.STAF_AKUNTANSI) {
        throw new ForbiddenException('Anda hanya bisa menonaktifkan Staf Akuntansi di tenant Anda sendiri');
      }
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
      select: { id: true, nama: true, isActive: true },
    });
  }
}
