import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  ImportWarehousesDto,
} from '../dto/warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findUnique({
      where: {
        tenantId_kode: { tenantId, kode: dto.kode },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Gudang dengan kode "${dto.kode}" sudah ada pada tenant ini.`,
      );
    }

    return this.prisma.warehouse.create({
      data: {
        tenantId,
        kode: dto.kode.trim().toUpperCase(),
        nama: dto.nama.trim(),
        alamat: dto.alamat?.trim() || null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId },
    });

    if (!warehouse) {
      throw new NotFoundException(`Gudang dengan ID "${id}" tidak ditemukan.`);
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: {
        nama: dto.nama !== undefined ? dto.nama.trim() : undefined,
        alamat: dto.alamat !== undefined ? dto.alamat?.trim() || null : undefined,
        isActive: dto.isActive,
      },
    });
  }

  async findAll(tenantId: string, isActive?: boolean) {
    const where: any = { tenantId };
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    return this.prisma.warehouse.findMany({
      where,
      orderBy: { kode: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId },
      include: {
        balances: {
          include: { item: true },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Gudang dengan ID "${id}" tidak ditemukan.`);
    }

    return warehouse;
  }

  async getOrCreateDefaultWarehouse(tenantId: string) {
    let defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { kode: 'asc' },
    });

    if (!defaultWarehouse) {
      defaultWarehouse = await this.prisma.warehouse.create({
        data: {
          tenantId,
          kode: 'GD-UTAMA',
          nama: 'Gudang Utama',
          alamat: 'Gudang Default Sistem',
          isActive: true,
        },
      });
    }

    return defaultWarehouse;
  }

  async importCsv(tenantId: string, dto: ImportWarehousesDto) {
    const results = [];
    const errors = [];

    for (let i = 0; i < dto.warehouses.length; i++) {
      const whDto = dto.warehouses[i];
      try {
        const wh = await this.create(tenantId, whDto);
        results.push(wh);
      } catch (err: any) {
        errors.push({
          baris: i + 1,
          kode: whDto.kode,
          error: err.message || 'Gagal menyimpan gudang',
        });
      }
    }

    return {
      berhasil: results.length,
      gagal: errors.length,
      errors,
      data: results,
    };
  }

  async delete(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    const movementsCount = await this.prisma.stockMovement.count({
      where: { tenantId, warehouseId: id },
    });

    if (movementsCount > 0) {
      return this.prisma.warehouse.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return this.prisma.warehouse.delete({
      where: { id },
    });
  }
}

