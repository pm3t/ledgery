import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCashBankAccountDto,
  UpdateCashBankAccountDto,
} from '../dto/cash-bank-account.dto';
import { ControlAccountType, CashBankEntryDirection } from '@prisma/client';

@Injectable()
export class CashBankAccountService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil semua rekening kas & bank untuk tenant beserta saldo saat ini.
   */
  async findAll(tenantId: string) {
    const accounts = await this.prisma.cashBankAccount.findMany({
      where: { tenantId },
      include: {
        chartOfAccount: {
          select: {
            id: true,
            kode_akun: true,
            nama_akun: true,
            kategori: true,
            controlType: true,
          },
        },
      },
      orderBy: { kode: 'asc' },
    });

    const results = [];
    for (const acc of accounts) {
      const balance = await this.getBalance(acc.id);
      const isComplete =
        acc.namaBank !== 'Lengkapi data bank' &&
        !!acc.noRekening &&
        acc.noRekening !== '-';

      results.push({
        ...acc,
        saldo: balance.saldoAkhir,
        saldoFungsional: balance.saldoFungsionalAkhir,
        isComplete,
      });
    }

    return results;
  }

  /**
   * Mengambil detail satu rekening kas & bank berdasarkan ID.
   */
  async findOne(tenantId: string, id: string) {
    const account = await this.prisma.cashBankAccount.findFirst({
      where: { id, tenantId },
      include: {
        chartOfAccount: true,
      },
    });

    if (!account) {
      throw new NotFoundException(`Rekening kas/bank dengan ID '${id}' tidak ditemukan`);
    }

    const balance = await this.getBalance(account.id);
    const isComplete =
      account.namaBank !== 'Lengkapi data bank' &&
      !!account.noRekening &&
      account.noRekening !== '-';

    return {
      ...account,
      saldo: balance.saldoAkhir,
      saldoFungsional: balance.saldoFungsionalAkhir,
      isComplete,
    };
  }

  /**
   * Membuat rekening kas & bank baru.
   */
  async create(tenantId: string, dto: CreateCashBankAccountDto) {
    // 1. Cek duplikasi kode pada tenant yang sama
    const duplicateKode = await this.prisma.cashBankAccount.findUnique({
      where: {
        tenantId_kode: { tenantId, kode: dto.kode.trim() },
      },
    });
    if (duplicateKode) {
      throw new ConflictException(`Kode rekening '${dto.kode}' sudah digunakan`);
    }

    // 2. Validasi Akun GL: harus terdaftar dan bertipe CASH_BANK
    const coa = await this.prisma.chartOfAccount.findFirst({
      where: { id: dto.chartOfAccountId, tenantId, isActive: true },
    });
    if (!coa) {
      throw new NotFoundException(`Akun GL dengan ID '${dto.chartOfAccountId}' tidak ditemukan atau tidak aktif`);
    }

    // Jika belum ditandai CASH_BANK, ubah otomatis
    if (coa.controlType !== ControlAccountType.CASH_BANK) {
      await this.prisma.chartOfAccount.update({
        where: { id: coa.id },
        data: { controlType: ControlAccountType.CASH_BANK },
      });
    }

    // 3. Cek apakah akun GL sudah dipakai oleh rekening lain (1:1 relationship per tenant)
    const existingUsage = await this.prisma.cashBankAccount.findFirst({
      where: { tenantId, chartOfAccountId: dto.chartOfAccountId },
    });
    if (existingUsage) {
      throw new ConflictException(
        `Akun GL '${coa.kode_akun} - ${coa.nama_akun}' sudah digunakan oleh rekening '${existingUsage.kode}'. 1 Akun GL CASH_BANK hanya boleh untuk 1 Rekening.`,
      );
    }

    // 4. Default mata uang mengikuti tenant jika tidak ditentukan
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const mataUang = dto.mata_uang || tenant?.mata_uang || 'IDR';

    return this.prisma.cashBankAccount.create({
      data: {
        tenantId,
        kode: dto.kode.trim(),
        nama: dto.nama.trim(),
        jenis: dto.jenis,
        chartOfAccountId: dto.chartOfAccountId,
        mata_uang: mataUang,
        namaBank: dto.namaBank || (dto.jenis === 'BANK' ? 'Lengkapi data bank' : null),
        noRekening: dto.noRekening || (dto.jenis === 'BANK' ? '-' : null),
        namaPemilik: dto.namaPemilik || null,
        plafonKasKecil: dto.plafonKasKecil ? Number(dto.plafonKasKecil) : null,
        externalRef: dto.externalRef || null,
        isActive: dto.isActive ?? true,
      },
      include: {
        chartOfAccount: true,
      },
    });
  }

  /**
   * Memperbarui informasi rekening kas & bank.
   */
  async update(tenantId: string, id: string, dto: UpdateCashBankAccountDto) {
    await this.findOne(tenantId, id);

    if (dto.kode) {
      const duplicateKode = await this.prisma.cashBankAccount.findFirst({
        where: {
          tenantId,
          kode: dto.kode.trim(),
          id: { not: id },
        },
      });
      if (duplicateKode) {
        throw new ConflictException(`Kode rekening '${dto.kode}' sudah digunakan oleh rekening lain`);
      }
    }

    return this.prisma.cashBankAccount.update({
      where: { id },
      data: {
        ...(dto.kode && { kode: dto.kode.trim() }),
        ...(dto.nama && { nama: dto.nama.trim() }),
        ...(dto.jenis && { jenis: dto.jenis }),
        ...(dto.namaBank !== undefined && { namaBank: dto.namaBank }),
        ...(dto.noRekening !== undefined && { noRekening: dto.noRekening }),
        ...(dto.namaPemilik !== undefined && { namaPemilik: dto.namaPemilik }),
        ...(dto.plafonKasKecil !== undefined && {
          plafonKasKecil: dto.plafonKasKecil !== null ? Number(dto.plafonKasKecil) : null,
        }),
        ...(dto.externalRef !== undefined && { externalRef: dto.externalRef }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        chartOfAccount: true,
      },
    });
  }

  /**
   * Menghitung saldo buku kas & bank per tanggal tertentu.
   */
  async getBalance(cashBankAccountId: string, tanggal?: string) {
    const whereCondition: any = { cashBankAccountId };
    if (tanggal) {
      const targetDate = new Date(`${tanggal}T23:59:59.999Z`);
      whereCondition.tanggal = { lte: targetDate };
    }

    const entries = await this.prisma.cashBankEntry.findMany({
      where: whereCondition,
      select: {
        arah: true,
        jumlah: true,
        jumlahFungsional: true,
      },
    });

    let totalMasuk = 0;
    let totalKeluar = 0;
    let totalMasukFungsional = 0;
    let totalKeluarFungsional = 0;

    for (const e of entries) {
      const amt = Number(e.jumlah);
      const amtF = Number(e.jumlahFungsional);
      if (e.arah === CashBankEntryDirection.MASUK) {
        totalMasuk += amt;
        totalMasukFungsional += amtF;
      } else {
        totalKeluar += amt;
        totalKeluarFungsional += amtF;
      }
    }

    const saldoAkhir = totalMasuk - totalKeluar;
    const saldoFungsionalAkhir = totalMasukFungsional - totalKeluarFungsional;

    return {
      totalMasuk,
      totalKeluar,
      saldoAkhir,
      totalMasukFungsional,
      totalKeluarFungsional,
      saldoFungsionalAkhir,
      entryCount: entries.length,
    };
  }
}

