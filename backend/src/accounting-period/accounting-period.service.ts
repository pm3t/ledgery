import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';
import { PeriodStatus } from '@prisma/client';

@Injectable()
export class AccountingPeriodService {
  constructor(private readonly prisma: PrismaService) {}

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
    const period = await this.prisma.accountingPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new BadRequestException('Periode tidak ditemukan');
    if (period.status === PeriodStatus.CLOSED) throw new BadRequestException('Periode sudah ditutup');

    return this.prisma.accountingPeriod.update({
      where: { id: periodId },
      data: {
        status: PeriodStatus.CLOSED,
        closedAt: new Date(),
        closedBy: userId,
      }
    });
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
   * Helper function untuk memvalidasi apakah jurnal bisa diposting di tanggal tertentu
   */
  async validateJournalDate(tenantId: string, tanggal: Date) {
    // Cari Fiscal Year yang mencakup tanggal jurnal
    const fiscalYear = await this.prisma.fiscalYear.findFirst({
      where: {
        tenantId,
        tanggal_mulai: { lte: tanggal },
        tanggal_selesai: { gte: tanggal }
      }
    });

    // Jika belum ada setup tahun buku sama sekali, biarkan (untuk backward compatibility tenant lama yang belum setup periode)
    if (!fiscalYear) {
      // Kita cek apakah tenant ini punya fiscal year sama sekali
      const anyFiscal = await this.prisma.fiscalYear.findFirst({ where: { tenantId } });
      if (!anyFiscal) return true; // Belum pakai modul ini, loloskan
      
      throw new BadRequestException('Tanggal transaksi tidak berada di dalam tahun buku aktif manapun.');
    }

    // Cari Periode di dalam Fiscal Year tersebut
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYearId: fiscalYear.id,
        tanggal_mulai: { lte: tanggal },
        tanggal_selesai: { gte: tanggal }
      }
    });

    if (!period) {
      throw new BadRequestException('Tanggal transaksi tidak berada di dalam periode akuntansi aktif manapun.');
    }

    if (period.status === PeriodStatus.CLOSED) {
      throw new BadRequestException(`Periode ${period.nomor_periode} (${fiscalYear.nama_tahun_buku}) sudah ditutup. Jurnal tidak dapat diposting.`);
    }

    return true;
  }
}
