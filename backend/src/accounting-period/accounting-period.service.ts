import { Injectable, BadRequestException, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';
import { PeriodStatus } from '@prisma/client';
import { SubledgerReconciliationService } from '../subledger/subledger-reconciliation.service';

@Injectable()
export class AccountingPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => SubledgerReconciliationService))
    private readonly subledgerReconService?: SubledgerReconciliationService,
  ) {}

  async createFiscalYear(tenantId: string, dto: CreateFiscalYearDto) {
    const { nama_tahun_buku, tanggal_mulai, tanggal_selesai, auto_generate, periods } = dto;
    
    // Validasi
    if (new Date(tanggal_mulai) >= new Date(tanggal_selesai)) {
      throw new BadRequestException('Tanggal mulai harus sebelum tanggal selesai.');
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Buat FiscalYear
      const fiscalYear = await tx.fiscalYear.create({
        data: {
          tenantId,
          nama_tahun_buku,
          tanggal_mulai: new Date(tanggal_mulai),
          tanggal_selesai: new Date(tanggal_selesai),
        },
      });

      // 2. Generate Periods
      let createdPeriods = [];
      if (auto_generate) {
        // Buat 12 periode bulanan
        let currentStartDate = new Date(tanggal_mulai);
        for (let i = 1; i <= 12; i++) {
          // Cari hari terakhir bulan ini
          const endOfMonth = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth() + 1, 0);
          
          createdPeriods.push({
            fiscalYearId: fiscalYear.id,
            nomor_periode: i,
            tanggal_mulai: currentStartDate,
            tanggal_selesai: endOfMonth > new Date(tanggal_selesai) && i === 12 ? new Date(tanggal_selesai) : endOfMonth,
          });

          // Pindah ke bulan berikutnya
          currentStartDate = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth() + 1, 1);
        }
        await tx.accountingPeriod.createMany({ data: createdPeriods });
      } else {
        // Mode Manual
        if (!periods || periods.length === 0) {
          throw new BadRequestException('Periode harus diisi jika auto_generate false.');
        }

        const dataToInsert = periods.map(p => ({
          fiscalYearId: fiscalYear.id,
          nomor_periode: p.nomor_periode,
          tanggal_mulai: new Date(p.tanggal_mulai),
          tanggal_selesai: new Date(p.tanggal_selesai),
        }));
        await tx.accountingPeriod.createMany({ data: dataToInsert });
      }

      return fiscalYear;
    });
  }

  async closePeriod(periodId: string, userId: string) {
    const period = await this.prisma.accountingPeriod.findUnique({
      where: { id: periodId },
      include: { fiscalYear: true },
    });
    if (!period) throw new BadRequestException('Periode tidak ditemukan');
    if (period.status === PeriodStatus.CLOSED) throw new BadRequestException('Periode sudah ditutup');

    const tenantId = period.fiscalYear.tenantId;

    // Periksa apakah tenant mengaktifkan modul subledger
    const subledgerSetting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    const isSubledgerActive =
      subledgerSetting &&
      (subledgerSetting.arEnabled ||
        subledgerSetting.apEnabled ||
        subledgerSetting.inventoryEnabled ||
        subledgerSetting.orderManagementEnabled);

    let reconciliationWarning: any = null;

    if (isSubledgerActive && this.subledgerReconService) {
      const tanggalSelesaiStr = period.tanggal_selesai.toISOString().slice(0, 10);
      const recon = await this.subledgerReconService.getReconciliation(tenantId, tanggalSelesaiStr);

      if (!recon.isFullyReconciled) {
        const discrepantAccounts: string[] = [];
        if (recon.accounts.ar.status === 'SELISIH') {
          discrepantAccounts.push(`Piutang (AR): Selisih Rp ${Math.abs(recon.accounts.ar.selisih).toLocaleString('id-ID')}`);
        }
        if (recon.accounts.ap.status === 'SELISIH') {
          discrepantAccounts.push(`Hutang (AP): Selisih Rp ${Math.abs(recon.accounts.ap.selisih).toLocaleString('id-ID')}`);
        }
        if (recon.accounts.inventory.status === 'SELISIH') {
          discrepantAccounts.push(`Persediaan: Selisih Rp ${Math.abs(recon.accounts.inventory.selisih).toLocaleString('id-ID')}`);
        }
        if (recon.accounts.grIrClearing.status === 'SELISIH') {
          discrepantAccounts.push(`Kliring GR/IR: Selisih Rp ${Math.abs(recon.accounts.grIrClearing.selisih).toLocaleString('id-ID')}`);
        }

        const detailsMsg = discrepantAccounts.join('; ');

        if (subledgerSetting.blockPeriodCloseOnRecon) {
          throw new BadRequestException({
            errorCode: 'PERIOD_CLOSE_BLOCKED_ON_RECONCILIATION',
            message: `Penutupan periode dibatalkan: Ditemukan selisih antara Sub Ledger dan Buku Besar pada akun: ${detailsMsg}. Pengaturan tenant mewajibkan rekonsiliasi tuntas sebelum periode ditutup.`,
            details: {
              reconciliation: recon,
              discrepancies: discrepantAccounts,
            },
          });
        } else {
          // Warning jika blockPeriodCloseOnRecon = false
          reconciliationWarning = {
            message: `Peringatan: Terdapat selisih rekonsiliasi subledger pada penutupan periode: ${detailsMsg}`,
            discrepancies: discrepantAccounts,
          };
        }
      }
    }

    // Pengecekan Rekonsiliasi Bank sampai akhir periode untuk rekening BANK aktif
    if (subledgerSetting && (subledgerSetting as any).cashBankEnabled) {
      const activeBankAccounts = await this.prisma.cashBankAccount.findMany({
        where: {
          tenantId,
          isActive: true,
          jenis: 'BANK',
        },
      });

      const uncompletedBankRecons: string[] = [];
      const tanggalSelesai = period.tanggal_selesai;

      for (const acc of activeBankAccounts) {
        const completedRecon = await this.prisma.bankReconciliation.findFirst({
          where: {
            tenantId,
            cashBankAccountId: acc.id,
            status: 'SELESAI',
            tanggalAkhir: { gte: tanggalSelesai },
          },
        });

        if (!completedRecon) {
          uncompletedBankRecons.push(`${acc.kode} - ${acc.nama}`);
        }
      }

      if (uncompletedBankRecons.length > 0) {
        const bankListMsg = uncompletedBankRecons.join(', ');
        if ((subledgerSetting as any).blockPeriodCloseOnBankRecon) {
          throw new BadRequestException({
            errorCode: 'PERIOD_CLOSE_BLOCKED_ON_BANK_RECON',
            message: `Penutupan periode dibatalkan: Rekonsiliasi Bank per akhir periode (${period.tanggal_selesai.toISOString().slice(0, 10)}) belum SELESAI untuk rekening: ${bankListMsg}. Pengaturan tenant memblokir closing sebelum rekonsiliasi bank tuntas.`,
            details: {
              uncompletedBankAccounts: uncompletedBankRecons,
            },
          });
        } else {
          reconciliationWarning = {
            ...(reconciliationWarning || {}),
            bankReconWarning: `Peringatan: Rekonsiliasi Bank per akhir periode belum SELESAI untuk rekening: ${bankListMsg}.`,
          };
        }
      }
    }

    // Pengecekan Proses Penyusutan Aset Tetap untuk periode berjalan
    if (subledgerSetting && (subledgerSetting as any).fixedAssetEnabled) {
      const activeDepreciableAsset = await this.prisma.fixedAsset.findFirst({
        where: {
          tenantId,
          status: 'AKTIF',
          category: {
            dapatDisusutkan: true,
          },
        },
      });

      const periodNama = `${period.fiscalYear.nama_tahun_buku} - Periode ${period.nomor_periode}`;

      if (activeDepreciableAsset) {
        const postedRun = await this.prisma.assetDepreciationRun.findFirst({
          where: {
            tenantId,
            periodId,
            status: 'POSTED',
          },
        });

        if (!postedRun) {
          if ((subledgerSetting as any).blockPeriodCloseOnDepreciation) {
            throw new BadRequestException({
              errorCode: 'PERIOD_CLOSE_BLOCKED_ON_DEPRECIATION',
              message: `Penutupan periode dibatalkan: Proses penyusutan aset tetap belum dijalankan (POSTED) untuk periode ${periodNama}. Pengaturan tenant memblokir penutupan periode sebelum penyusutan aset diposting.`,
              details: {
                periodId,
                periodName: periodNama,
              },
            });
          } else {
            reconciliationWarning = {
              ...(reconciliationWarning || {}),
              depreciationWarning: `Peringatan: Proses penyusutan aset tetap belum dijalankan untuk periode ${periodNama}.`,
            };
          }
        }
      }
    }

    const updated = await this.prisma.accountingPeriod.update({
      where: { id: periodId },
      data: {
        status: PeriodStatus.CLOSED,
        closedAt: new Date(),
        closedBy: userId,
      },
    });

    return {
      ...updated,
      warning: reconciliationWarning,
    };
  }

  async reopenPeriod(periodId: string, userId: string) {
    const period = await this.prisma.accountingPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new BadRequestException('Periode tidak ditemukan');
    if (period.status === PeriodStatus.OPEN) throw new BadRequestException('Periode sudah terbuka');

    return this.prisma.accountingPeriod.update({
      where: { id: periodId },
      data: {
        status: PeriodStatus.OPEN,
        reopenedAt: new Date(),
        reopenedBy: userId,
      }
    });
  }

  async getPeriods(fiscalYearId: string) {
    return this.prisma.accountingPeriod.findMany({
      where: { fiscalYearId },
      orderBy: { nomor_periode: 'asc' }
    });
  }

  async getFiscalYears(tenantId: string) {
    return this.prisma.fiscalYear.findMany({
      where: { tenantId },
      orderBy: { tanggal_mulai: 'desc' },
      include: {
        accountingPeriods: {
          orderBy: { nomor_periode: 'asc' }
        }
      }
    });
  }

  /**
   * Helper function untuk mengevaluasi apakah tanggal dapat diposting tanpa melempar exception
   */
  async evaluatePostingDate(tenantId: string, tanggal: Date) {
    const dateStr = tanggal.toISOString().slice(0, 10);

    // Cari Fiscal Year yang mencakup tanggal jurnal
    const fiscalYear = await this.prisma.fiscalYear.findFirst({
      where: {
        tenantId,
        tanggal_mulai: { lte: tanggal },
        tanggal_selesai: { gte: tanggal },
      },
    });

    // Jika belum ada setup tahun buku sama sekali
    if (!fiscalYear) {
      const anyFiscal = await this.prisma.fiscalYear.findFirst({ where: { tenantId } });
      if (!anyFiscal) {
        return {
          can_post: true,
          status: 'NOT_DEFINED' as const,
          date: dateStr,
          period: null,
        };
      }

      return {
        can_post: false,
        status: 'NOT_DEFINED' as const,
        date: dateStr,
        period: null,
        errorCode: 'PERIOD_NOT_FOUND',
        errorMessage: 'Tanggal transaksi tidak berada di dalam tahun buku aktif manapun.',
        details: { date: dateStr },
      };
    }

    // Cari Periode di dalam Fiscal Year tersebut
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYearId: fiscalYear.id,
        tanggal_mulai: { lte: tanggal },
        tanggal_selesai: { gte: tanggal },
      },
    });

    if (!period) {
      return {
        can_post: false,
        status: 'NOT_DEFINED' as const,
        date: dateStr,
        period: null,
        errorCode: 'PERIOD_NOT_FOUND',
        errorMessage: 'Tanggal transaksi tidak berada di dalam periode akuntansi aktif manapun.',
        details: { date: dateStr, fiscalYear: fiscalYear.nama_tahun_buku },
      };
    }

    const periodInfo = {
      id: period.id,
      name: `Periode ${period.nomor_periode} (${fiscalYear.nama_tahun_buku})`,
      start_date: period.tanggal_mulai
        ? (period.tanggal_mulai instanceof Date
            ? period.tanggal_mulai.toISOString().slice(0, 10)
            : new Date(period.tanggal_mulai).toISOString().slice(0, 10))
        : '',
      end_date: period.tanggal_selesai
        ? (period.tanggal_selesai instanceof Date
            ? period.tanggal_selesai.toISOString().slice(0, 10)
            : new Date(period.tanggal_selesai).toISOString().slice(0, 10))
        : '',
    };

    if (period.status === PeriodStatus.CLOSED) {
      return {
        can_post: false,
        status: 'CLOSED' as const,
        date: dateStr,
        period: periodInfo,
        errorCode: 'PERIOD_CLOSED',
        errorMessage: `Periode ${period.nomor_periode} (${fiscalYear.nama_tahun_buku}) sudah ditutup. Jurnal tidak dapat diposting.`,
        details: {
          date: dateStr,
          periodNumber: period.nomor_periode,
          fiscalYear: fiscalYear.nama_tahun_buku,
          closedAt: period.closedAt,
        },
      };
    }

    return {
      can_post: true,
      status: 'OPEN' as const,
      date: dateStr,
      period: periodInfo,
    };
  }

  /**
   * Helper function untuk memvalidasi apakah jurnal bisa diposting di tanggal tertentu
   */
  async validateJournalDate(tenantId: string, tanggal: Date) {
    const evaluation = await this.evaluatePostingDate(tenantId, tanggal);
    if (!evaluation.can_post) {
      throw new BadRequestException({
        errorCode: evaluation.errorCode,
        message: evaluation.errorMessage,
        details: evaluation.details,
      });
    }
    return true;
  }

  /**
   * Mengambil daftar periode untuk API V1
   */
  async getPeriodsV1(
    tenantId: string,
    filter?: { from?: string; to?: string; status?: PeriodStatus },
  ) {
    const where: any = {
      fiscalYear: {
        tenantId,
      },
    };

    if (filter?.status) {
      where.status = filter.status;
    }

    if (filter?.from) {
      where.tanggal_selesai = { gte: new Date(filter.from) };
    }

    if (filter?.to) {
      where.tanggal_mulai = { lte: new Date(`${filter.to}T23:59:59.999Z`) };
    }

    const periods = await this.prisma.accountingPeriod.findMany({
      where,
      orderBy: { tanggal_mulai: 'asc' },
      take: 200,
      include: {
        fiscalYear: {
          select: { nama_tahun_buku: true },
        },
      },
    });

    return periods.map((p) => ({
      id: p.id,
      name: `Periode ${p.nomor_periode} (${p.fiscalYear.nama_tahun_buku})`,
      start_date: p.tanggal_mulai.toISOString().slice(0, 10),
      end_date: p.tanggal_selesai.toISOString().slice(0, 10),
      status: p.status,
    }));
  }

  /**
   * Query status periode akuntansi untuk tanggal tertentu (digunakan oleh API Key eksternal)
   */
  async checkPeriodStatus(tenantId: string, tanggal: Date) {
    const fiscalYear = await this.prisma.fiscalYear.findFirst({
      where: {
        tenantId,
        tanggal_mulai: { lte: tanggal },
        tanggal_selesai: { gte: tanggal },
      },
    });

    const dateStr = tanggal.toISOString().slice(0, 10);

    if (!fiscalYear) {
      const anyFiscal = await this.prisma.fiscalYear.findFirst({ where: { tenantId } });
      if (!anyFiscal) {
        return {
          date: dateStr,
          isOpen: true,
          status: 'OPEN',
          periodNumber: null,
          fiscalYear: null,
          fiscalYearId: null,
          periodId: null,
          message: 'Tenant belum mengaktifkan pembatasan periode akuntansi',
        };
      }

      return {
        date: dateStr,
        isOpen: false,
        status: 'PERIOD_NOT_FOUND',
        periodNumber: null,
        fiscalYear: null,
        fiscalYearId: null,
        periodId: null,
        message: 'Tanggal transaksi tidak berada di dalam tahun buku aktif manapun',
      };
    }

    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYearId: fiscalYear.id,
        tanggal_mulai: { lte: tanggal },
        tanggal_selesai: { gte: tanggal },
      },
    });

    if (!period) {
      return {
        date: dateStr,
        isOpen: false,
        status: 'PERIOD_NOT_FOUND',
        periodNumber: null,
        fiscalYear: fiscalYear.nama_tahun_buku,
        fiscalYearId: fiscalYear.id,
        periodId: null,
        message: 'Tanggal transaksi tidak berada di dalam periode akuntansi aktif manapun',
      };
    }

    const isOpen = period.status === PeriodStatus.OPEN;
    return {
      date: dateStr,
      isOpen,
      status: period.status,
      periodNumber: period.nomor_periode,
      fiscalYear: fiscalYear.nama_tahun_buku,
      fiscalYearId: fiscalYear.id,
      periodId: period.id,
      message: isOpen
        ? `Periode ${period.nomor_periode} (${fiscalYear.nama_tahun_buku}) terbuka untuk posting transaksi`
        : `Periode ${period.nomor_periode} (${fiscalYear.nama_tahun_buku}) sudah ditutup`,
    };
  }
}
