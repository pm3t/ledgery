import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { KategoriAkun, ControlAccountType } from '@prisma/client';

// Service untuk mengelola Chart of Accounts (COA) per Tenant
@Injectable()
export class ChartOfAccountService {
  constructor(private readonly prisma: PrismaService) {}

  // Membuat kode akun baru untuk tenant
  async create(createAccountDto: CreateAccountDto) {
    const { tenantId, kode_akun, parentId } = createAccountDto;

    // 1. Memastikan Tenant terdaftar
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant dengan ID ${tenantId} tidak ditemukan`);
    }

    // 2. Memeriksa keunikan kode_akun dalam tenant yang sama
    const existing = await this.prisma.chartOfAccount.findUnique({
      where: {
        tenantId_kode_akun: {
          tenantId,
          kode_akun,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Kode akun '${kode_akun}' sudah digunakan pada tenant ini`,
      );
    }

    // 3. Memvalidasi parentId jika diisi
    if (parentId) {
      const parent = await this.prisma.chartOfAccount.findUnique({
        where: { id: parentId },
      });
      if (!parent || parent.tenantId !== tenantId) {
        throw new BadRequestException(
          'Akun induk (parentId) tidak ditemukan atau berbeda tenant',
        );
      }
    }

    const controlType = createAccountDto.controlType ?? ControlAccountType.NONE;
    const isControlAccount = controlType !== ControlAccountType.NONE ? true : (createAccountDto.isControlAccount ?? false);

    // 4. Menyimpan kode akun ke database
    return this.prisma.chartOfAccount.create({
      data: {
        tenantId,
        kode_akun: createAccountDto.kode_akun.trim(),
        nama_akun: createAccountDto.nama_akun.trim(),
        kategori: createAccountDto.kategori,
        parentId: parentId || null,
        isActive: createAccountDto.isActive ?? true,
        isControlAccount,
        controlType,
      },
      include: {
        parent: true,
      },
    });
  }

  // Mengambil daftar akun per tenant (dengan opsional filter kategori & pencarian)
  async findByTenant(
    tenantId: string,
    kategori?: KategoriAkun,
    search?: string,
  ) {
    const whereClause: any = { tenantId };

    if (kategori) {
      whereClause.kategori = kategori;
    }

    if (search) {
      whereClause.OR = [
        { kode_akun: { contains: search, mode: 'insensitive' } },
        { nama_akun: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.chartOfAccount.findMany({
      where: whereClause,
      include: {
        parent: {
          select: { id: true, kode_akun: true, nama_akun: true },
        },
        children: {
          select: { id: true, kode_akun: true, nama_akun: true, kategori: true },
        },
      },
      orderBy: { kode_akun: 'asc' },
    });
  }

  // Mengambil detail satu akun berdasarkan ID
  async findOne(id: string) {
    const account = await this.prisma.chartOfAccount.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });

    if (!account) {
      throw new NotFoundException(`Kode akun dengan ID ${id} tidak ditemukan`);
    }

    return account;
  }

  // Mengubah data akun
  async update(id: string, updateAccountDto: UpdateAccountDto) {
    const currentAccount = await this.findOne(id);

    // Jika kode_akun diubah, pastikan tetap unik per tenant
    if (
      updateAccountDto.kode_akun &&
      updateAccountDto.kode_akun !== currentAccount.kode_akun
    ) {
      const existing = await this.prisma.chartOfAccount.findUnique({
        where: {
          tenantId_kode_akun: {
            tenantId: currentAccount.tenantId,
            kode_akun: updateAccountDto.kode_akun,
          },
        },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Kode akun '${updateAccountDto.kode_akun}' sudah digunakan pada tenant ini`,
        );
      }
    }

    // Memvalidasi parentId agar tidak menunjuk ke diri sendiri
    if (updateAccountDto.parentId === id) {
      throw new BadRequestException(
        'Akun tidak dapat menjadi induk bagi dirinya sendiri',
      );
    }

    return this.prisma.chartOfAccount.update({
      where: { id },
      data: {
        ...(updateAccountDto.kode_akun && {
          kode_akun: updateAccountDto.kode_akun.trim(),
        }),
        ...(updateAccountDto.nama_akun && {
          nama_akun: updateAccountDto.nama_akun.trim(),
        }),
        ...(updateAccountDto.kategori && { kategori: updateAccountDto.kategori }),
        ...(updateAccountDto.parentId !== undefined && {
          parentId: updateAccountDto.parentId || null,
        }),
        ...(updateAccountDto.isActive !== undefined && {
          isActive: updateAccountDto.isActive,
        }),
        ...(updateAccountDto.controlType !== undefined && {
          controlType: updateAccountDto.controlType,
        }),
        ...(updateAccountDto.controlType !== undefined && updateAccountDto.controlType !== ControlAccountType.NONE
          ? { isControlAccount: true }
          : updateAccountDto.isControlAccount !== undefined
          ? { isControlAccount: updateAccountDto.isControlAccount }
          : {}),
      },
      include: {
        parent: true,
      },
    });
  }

  // Menghapus akun
  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.chartOfAccount.delete({
      where: { id },
    });
  }
}
