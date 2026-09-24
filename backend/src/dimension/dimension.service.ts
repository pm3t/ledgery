import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DimensionService {
  constructor(private prisma: PrismaService) {}

  async createDimension(tenantId: string, data: { nama_dimension: string }) {
    const existing = await this.prisma.dimension.findUnique({
      where: { tenantId_nama_dimension: { tenantId, nama_dimension: data.nama_dimension } }
    });
    if (existing) {
      if (!existing.isActive) {
        return this.prisma.dimension.update({
          where: { id: existing.id },
          data: { isActive: true }
        });
      }
      throw new ConflictException(`Dimensi ${data.nama_dimension} sudah ada.`);
    }
    return this.prisma.dimension.create({
      data: { tenantId, nama_dimension: data.nama_dimension }
    });
  }

  async findAllDimensions(tenantId: string) {
    return this.prisma.dimension.findMany({
      where: { tenantId, isActive: true },
      include: { values: { where: { isActive: true } } }
    });
  }

  async addDimensionValue(dimensionId: string, data: { kode: string, nama: string }) {
    const dim = await this.prisma.dimension.findUnique({ where: { id: dimensionId } });
    if (!dim) throw new NotFoundException('Dimensi tidak ditemukan');

    const existing = await this.prisma.dimensionValue.findUnique({
      where: { dimensionId_kode: { dimensionId, kode: data.kode } }
    });

    if (existing) {
      if (!existing.isActive) {
        return this.prisma.dimensionValue.update({
          where: { id: existing.id },
          data: { isActive: true, nama: data.nama }
        });
      }
      throw new ConflictException(`Kode value ${data.kode} sudah digunakan.`);
    }

    return this.prisma.dimensionValue.create({
      data: { dimensionId, kode: data.kode, nama: data.nama }
    });
  }

  async removeDimension(id: string) {
    return this.prisma.dimension.update({
      where: { id },
      data: { isActive: false }
    });
  }

  async removeDimensionValue(id: string) {
    return this.prisma.dimensionValue.update({
      where: { id },
      data: { isActive: false }
    });
  }
}
