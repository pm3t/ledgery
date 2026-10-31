import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateItemDto, UpdateItemDto, ImportItemsDto } from '../dto/item.dto';

@Injectable()
export class ItemService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateItemDto) {
    // Periksa apakah kode item sudah digunakan di tenant ini
    const existing = await this.prisma.item.findUnique({
      where: {
        tenantId_kode: { tenantId, kode: dto.kode },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Barang dengan kode "${dto.kode}" sudah ada pada tenant ini.`,
      );
    }

    if (dto.externalRef) {
      const existingRef = await this.prisma.item.findUnique({
        where: {
          tenantId_externalRef: { tenantId, externalRef: dto.externalRef },
        },
      });
      if (existingRef) {
        throw new ConflictException(
          `Barang dengan referensi eksternal "${dto.externalRef}" sudah digunakan.`,
        );
      }
    }

    // Ambil default metode valuasi dari setting jika tidak ditentukan
    let valuationMethod = dto.valuationMethod;
    if (!valuationMethod) {
      const setting = await this.prisma.subledgerSetting.findUnique({
        where: { tenantId },
      });
      valuationMethod = setting?.defaultValuationMethod || 'MOVING_AVERAGE';
    }

    return this.prisma.item.create({
      data: {
        tenantId,
        kode: dto.kode.trim().toUpperCase(),
        nama: dto.nama.trim(),
        groupCode: dto.groupCode?.trim() || null,
        satuan: dto.satuan?.trim().toUpperCase() || 'PCS',
        tipe: dto.tipe || 'STOK',
        akunPersediaanId: dto.akunPersediaanId || null,
        akunHppId: dto.akunHppId || null,
        akunPendapatanId: dto.akunPendapatanId || null,
        valuationMethod,
        externalRef: dto.externalRef?.trim() || null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
      include: {
        akunPersediaan: true,
        akunHpp: true,
        akunPendapatan: true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateItemDto) {
    const item = await this.prisma.item.findFirst({
      where: { id, tenantId },
    });

    if (!item) {
      throw new NotFoundException(`Barang dengan ID "${id}" tidak ditemukan.`);
    }

    // VALIDASI PERUBAHAN METODE VALUASI:
    // Hanya boleh diubah bila belum ada pergerakan stok atau stok = 0
    if (
      dto.valuationMethod &&
      dto.valuationMethod !== item.valuationMethod
    ) {
      const movementsCount = await this.prisma.stockMovement.count({
        where: { tenantId, itemId: id },
      });

      if (movementsCount > 0) {
        // Cek apakah total stok di semua gudang bernilai nol
        const balances = await this.prisma.stockBalance.findMany({
          where: { tenantId, itemId: id },
        });
        const totalQty = balances.reduce((sum, b) => sum + Number(b.qty), 0);

        if (totalQty !== 0) {
          throw new BadRequestException(
            `Metode valuasi barang tidak dapat diubah karena barang sudah memiliki pergerakan stok dan sisa kuantitas stok saat ini tidak nol (${totalQty} ${item.satuan}). Lakukan penyesuaian stok menjadi nol terlebih dahulu.`,
          );
        }
      }
    }

    if (dto.externalRef && dto.externalRef !== item.externalRef) {
      const existingRef = await this.prisma.item.findUnique({
        where: {
          tenantId_externalRef: { tenantId, externalRef: dto.externalRef },
        },
      });
      if (existingRef && existingRef.id !== id) {
        throw new ConflictException(
          `Referensi eksternal "${dto.externalRef}" sudah digunakan oleh barang lain.`,
        );
      }
    }

    return this.prisma.item.update({
      where: { id },
      data: {
        nama: dto.nama !== undefined ? dto.nama.trim() : undefined,
        groupCode: dto.groupCode !== undefined ? dto.groupCode?.trim() || null : undefined,
        satuan: dto.satuan !== undefined ? dto.satuan?.trim().toUpperCase() : undefined,
        tipe: dto.tipe,
        akunPersediaanId: dto.akunPersediaanId,
        akunHppId: dto.akunHppId,
        akunPendapatanId: dto.akunPendapatanId,
        valuationMethod: dto.valuationMethod,
        externalRef: dto.externalRef !== undefined ? dto.externalRef?.trim() || null : undefined,
        isActive: dto.isActive,
      },
      include: {
        akunPersediaan: true,
        akunHpp: true,
        akunPendapatan: true,
      },
    });
  }

  async findAll(
    tenantId: string,
    params?: {
      tipe?: string;
      groupCode?: string;
      isActive?: boolean;
      search?: string;
    },
  ) {
    const where: any = { tenantId };

    if (params?.tipe) {
      where.tipe = params.tipe;
    }
    if (params?.groupCode) {
      where.groupCode = params.groupCode;
    }
    if (params?.isActive !== undefined) {
      where.isActive = params.isActive;
    }
    if (params?.search) {
      where.OR = [
        { kode: { contains: params.search, mode: 'insensitive' } },
        { nama: { contains: params.search, mode: 'insensitive' } },
        { externalRef: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.item.findMany({
      where,
      orderBy: { kode: 'asc' },
      include: {
        akunPersediaan: true,
        akunHpp: true,
        akunPendapatan: true,
        balances: {
          include: { warehouse: true },
        },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, tenantId },
      include: {
        akunPersediaan: true,
        akunHpp: true,
        akunPendapatan: true,
        balances: {
          include: { warehouse: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Barang dengan ID "${id}" tidak ditemukan.`);
    }

    return item;
  }

  async findByExternalRef(tenantId: string, externalRef: string) {
    return this.prisma.item.findUnique({
      where: {
        tenantId_externalRef: { tenantId, externalRef },
      },
      include: {
        akunPersediaan: true,
        akunHpp: true,
        akunPendapatan: true,
        balances: {
          include: { warehouse: true },
        },
      },
    });
  }

  async upsertByExternalRef(
    tenantId: string,
    externalRef: string,
    dto: CreateItemDto,
  ) {
    const existing = await this.findByExternalRef(tenantId, externalRef);
    if (existing) {
      return this.update(tenantId, existing.id, dto);
    } else {
      return this.create(tenantId, { ...dto, externalRef });
    }
  }

  async importCsv(tenantId: string, dto: ImportItemsDto) {
    const results = [];
    const errors = [];

    for (let i = 0; i < dto.items.length; i++) {
      const itemDto = dto.items[i];
      try {
        const item = await this.create(tenantId, itemDto);
        results.push(item);
      } catch (err: any) {
        errors.push({
          baris: i + 1,
          kode: itemDto.kode,
          error: err.message || 'Gagal menyimpan barang',
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
    const item = await this.findById(tenantId, id);

    const movementsCount = await this.prisma.stockMovement.count({
      where: { tenantId, itemId: id },
    });

    if (movementsCount > 0) {
      // Jika barang pernah memiliki pergerakan transaksi, jangan hapus fisik, nonaktifkan
      return this.prisma.item.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return this.prisma.item.delete({
      where: { id },
    });
  }
}

