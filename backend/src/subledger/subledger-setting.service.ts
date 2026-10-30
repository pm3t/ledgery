import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateSubledgerSettingDto,
  UpsertPostingSetupItemDto,
} from './dto/subledger-setting.dto';
import {
  KategoriAkun,
  PostingSetupKey,
  ControlAccountType,
} from '@prisma/client';

@Injectable()
export class SubledgerSettingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil setting subledger tenant. Jika belum ada, buat default.
   */
  async getSettings(tenantId: string) {
    let setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    if (!setting) {
      setting = await this.prisma.subledgerSetting.create({
        data: {
          tenantId,
        },
      });
    }

    return setting;
  }

  /**
   * Memperbarui pengaturan subledger tenant.
   */
  async updateSettings(tenantId: string, dto: UpdateSubledgerSettingDto) {
    await this.getSettings(tenantId); // pastikan sudah ada record-nya

    return this.prisma.subledgerSetting.update({
      where: { tenantId },
      data: {
        ...(dto.arEnabled !== undefined && { arEnabled: dto.arEnabled }),
        ...(dto.apEnabled !== undefined && { apEnabled: dto.apEnabled }),
        ...(dto.inventoryEnabled !== undefined && {
          inventoryEnabled: dto.inventoryEnabled,
        }),
        ...(dto.orderManagementEnabled !== undefined && {
          orderManagementEnabled: dto.orderManagementEnabled,
        }),
        ...(dto.defaultValuationMethod !== undefined && {
          defaultValuationMethod: dto.defaultValuationMethod,
        }),
        ...(dto.overDeliveryTolerancePct !== undefined && {
          overDeliveryTolerancePct: dto.overDeliveryTolerancePct,
        }),
        ...(dto.allowNegativeStock !== undefined && {
          allowNegativeStock: dto.allowNegativeStock,
        }),
        ...(dto.creditLimitMode !== undefined && {
          creditLimitMode: dto.creditLimitMode,
        }),
        ...(dto.agingBuckets !== undefined && {
          agingBuckets: dto.agingBuckets as any,
        }),
        ...(dto.blockPeriodCloseOnRecon !== undefined && {
          blockPeriodCloseOnRecon: dto.blockPeriodCloseOnRecon,
        }),
      },
    });
  }

  /**
   * Mengambil daftar pemetaan akun posting subledger per tenant.
   */
  async getPostingSetups(tenantId: string) {
    return this.prisma.postingSetup.findMany({
      where: { tenantId },
      include: {
        account: {
          select: {
            id: true,
            kode_akun: true,
            nama_akun: true,
            kategori: true,
            controlType: true,
          },
        },
      },
      orderBy: { key: 'asc' },
    });
  }

  /**
   * Menyimpan / memperbarui pemetaan akun posting subledger dengan validasi kategori COA.
   */
  async upsertPostingSetup(tenantId: string, dto: UpsertPostingSetupItemDto) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: dto.accountId, tenantId, isActive: true },
    });

    if (!account) {
      throw new NotFoundException(
        `Akun dengan ID '${dto.accountId}' tidak ditemukan atau sedang tidak aktif di tenant ini.`,
      );
    }

    // Validasi kesesuaian kategori akun
    this.validateAccountCategoryForKey(dto.key, account.kategori);

    // Jika key adalah AR_CONTROL, AP_CONTROL, atau INVENTORY, pastikan akun ditandai controlType yang cocok
    if (dto.key === PostingSetupKey.AR_CONTROL && account.controlType !== ControlAccountType.AR) {
      await this.prisma.chartOfAccount.update({
        where: { id: account.id },
        data: { controlType: ControlAccountType.AR, isControlAccount: true },
      });
    } else if (dto.key === PostingSetupKey.AP_CONTROL && account.controlType !== ControlAccountType.AP) {
      await this.prisma.chartOfAccount.update({
        where: { id: account.id },
        data: { controlType: ControlAccountType.AP, isControlAccount: true },
      });
    } else if (dto.key === PostingSetupKey.INVENTORY && account.controlType !== ControlAccountType.INVENTORY) {
      await this.prisma.chartOfAccount.update({
        where: { id: account.id },
        data: { controlType: ControlAccountType.INVENTORY, isControlAccount: true },
      });
    }

    // Upsert record posting setup
    const existing = await this.prisma.postingSetup.findFirst({
      where: {
        tenantId,
        key: dto.key,
        groupCode: dto.groupCode || null,
      },
    });

    if (existing) {
      return this.prisma.postingSetup.update({
        where: { id: existing.id },
        data: {
          accountId: dto.accountId,
        },
        include: {
          account: true,
        },
      });
    }

    return this.prisma.postingSetup.create({
      data: {
        tenantId,
        key: dto.key,
        accountId: dto.accountId,
        groupCode: dto.groupCode || null,
      },
      include: {
        account: true,
      },
    });
  }

  /**
   * Menyimpan pemetaan akun secara batch.
   */
  async batchUpsertPostingSetups(
    tenantId: string,
    items: UpsertPostingSetupItemDto[],
  ) {
    const results = [];
    for (const item of items) {
      const res = await this.upsertPostingSetup(tenantId, item);
      results.push(res);
    }
    return results;
  }

  /**
   * Validasi logika bisnis: Kategori akun harus masuk akal sesuai fungsi setupnya.
   */
  private validateAccountCategoryForKey(
    key: PostingSetupKey,
    kategori: KategoriAkun,
  ) {
    const validRules: Record<PostingSetupKey, KategoriAkun[]> = {
      [PostingSetupKey.AR_CONTROL]: [KategoriAkun.ASET],
      [PostingSetupKey.SALES_REVENUE]: [KategoriAkun.PENDAPATAN],
      [PostingSetupKey.SALES_DISCOUNT]: [
        KategoriAkun.PENDAPATAN,
        KategoriAkun.BEBAN,
      ],
      [PostingSetupKey.PPN_KELUARAN]: [KategoriAkun.LIABILITAS],
      [PostingSetupKey.AP_CONTROL]: [KategoriAkun.LIABILITAS],
      [PostingSetupKey.PURCHASE_EXPENSE]: [
        KategoriAkun.BEBAN,
        KategoriAkun.ASET,
      ],
      [PostingSetupKey.PURCHASE_DISCOUNT]: [
        KategoriAkun.PENDAPATAN,
        KategoriAkun.BEBAN,
      ],
      [PostingSetupKey.PPN_MASUKAN]: [KategoriAkun.ASET],
      [PostingSetupKey.INVENTORY]: [KategoriAkun.ASET],
      [PostingSetupKey.COGS]: [KategoriAkun.BEBAN],
      [PostingSetupKey.INVENTORY_ADJUSTMENT]: [
        KategoriAkun.BEBAN,
        KategoriAkun.PENDAPATAN,
      ],
      [PostingSetupKey.GR_IR_CLEARING]: [
        KategoriAkun.LIABILITAS,
        KategoriAkun.ASET,
      ],
      [PostingSetupKey.PURCHASE_PRICE_VARIANCE]: [
        KategoriAkun.BEBAN,
        KategoriAkun.PENDAPATAN,
      ],
      [PostingSetupKey.FX_GAIN_LOSS]: [
        KategoriAkun.BEBAN,
        KategoriAkun.PENDAPATAN,
      ],
      [PostingSetupKey.CASH_DEFAULT]: [KategoriAkun.ASET],
    };

    const allowed = validRules[key];
    if (!allowed.includes(kategori)) {
      throw new BadRequestException(
        `Kategori akun '${kategori}' tidak cocok untuk fungsi '${key}'. Kategori yang diperbolehkan: ${allowed.join(', ')}`,
      );
    }
  }

  /**
   * Memeriksa saldo GL akun kontrol saat aktivasi subledger atau penetapan akun kontrol.
   * Mengembalikan status dan peringatan jika saldo saat ini tidak nol.
   */
  async checkControlAccountBalances(tenantId: string) {
    const controlAccounts = await this.prisma.chartOfAccount.findMany({
      where: {
        tenantId,
        OR: [
          { controlType: { not: ControlAccountType.NONE } },
          { isControlAccount: true },
        ],
      },
    });

    if (controlAccounts.length === 0) {
      return {
        hasNonZeroBalances: false,
        status: 'Siap aktivasi',
        warning: null,
        accounts: [],
      };
    }

    const accountIds = controlAccounts.map((a) => a.id);
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        chartOfAccountId: { in: accountIds },
        journal: {
          tenantId,
          status: 'POSTED',
        },
      },
      select: {
        chartOfAccountId: true,
        tipe: true,
        jumlah: true,
      },
    });

    const balanceMap = new Map<string, number>();
    for (const a of controlAccounts) {
      balanceMap.set(a.id, 0);
    }

    for (const entry of entries) {
      const cur = balanceMap.get(entry.chartOfAccountId) || 0;
      const amount = Number(entry.jumlah);
      balanceMap.set(
        entry.chartOfAccountId,
        entry.tipe === 'DEBIT' ? cur + amount : cur - amount,
      );
    }

    const nonZeroAccounts: any[] = [];
    let hasNonZero = false;

    for (const acc of controlAccounts) {
      const net = balanceMap.get(acc.id) || 0;
      // Normal balance: untuk Liabilitas/Ekuitas, saldo normal = Kredit - Debit
      let saldo = net;
      if (
        acc.kategori === KategoriAkun.LIABILITAS ||
        acc.kategori === KategoriAkun.EKUITAS ||
        acc.kategori === KategoriAkun.PENDAPATAN
      ) {
        saldo = -net;
      }

      if (Math.abs(saldo) > 0.001) {
        hasNonZero = true;
      }

      nonZeroAccounts.push({
        id: acc.id,
        kode_akun: acc.kode_akun,
        nama_akun: acc.nama_akun,
        kategori: acc.kategori,
        controlType: acc.controlType,
        saldoGL: saldo,
      });
    }

    return {
      hasNonZeroBalances: hasNonZero,
      status: hasNonZero ? 'Belum rekonsiliasi' : 'Siap aktivasi',
      warning: hasNonZero
        ? 'Saldo akun kontrol saat ini tidak bernilai 0. Pastikan saldo awal subledger telah diimpor agar laporan rekonsiliasi cocok.'
        : null,
      accounts: nonZeroAccounts,
    };
  }
}

