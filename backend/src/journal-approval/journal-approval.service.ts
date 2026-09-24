import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalStatus, ApprovalAction } from '@prisma/client';

import { AccountingPeriodService } from '../accounting-period/accounting-period.service';

@Injectable()
export class JournalApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingPeriodService: AccountingPeriodService,
  ) {}

  // Ambil daftar jurnal PENDING untuk direview
  async getPendingJournals(tenantId: string) {
    return this.prisma.journal.findMany({
      where: {
        tenantId,
        status: JournalStatus.PENDING,
      },
      include: {
        entries: {
          include: {
            chartOfAccount: {
              select: { kode_akun: true, nama_akun: true },
            },
          },
        },
      },
      orderBy: { tanggal: 'asc' },
    });
  }

  // Approve jurnal
  async approveJournal(tenantId: string, journalId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const journal = await tx.journal.findUnique({
        where: { id: journalId },
      });

      if (!journal || journal.tenantId !== tenantId) {
        throw new NotFoundException('Jurnal tidak ditemukan');
      }

      if (journal.status !== JournalStatus.PENDING) {
        throw new BadRequestException(`Hanya jurnal berstatus PENDING yang bisa diapprove. Status saat ini: ${journal.status}`);
      }

      await this.accountingPeriodService.validateJournalDate(tenantId, journal.tanggal);

      const updated = await tx.journal.update({
        where: { id: journalId },
        data: { status: JournalStatus.APPROVED },
      });

      await tx.journalApprovalLog.create({
        data: {
          journalId,
          action: ApprovalAction.APPROVED,
          actorUserId,
        },
      });

      return updated;
    });
  }

  // Reject jurnal
  async rejectJournal(tenantId: string, journalId: string, alasan: string, actorUserId: string) {
    if (!alasan || alasan.trim() === '') {
      throw new BadRequestException('Alasan penolakan harus diisi');
    }

    return this.prisma.$transaction(async (tx) => {
      const journal = await tx.journal.findUnique({
        where: { id: journalId },
      });

      if (!journal || journal.tenantId !== tenantId) {
        throw new NotFoundException('Jurnal tidak ditemukan');
      }

      if (journal.status !== JournalStatus.PENDING) {
        throw new BadRequestException(`Hanya jurnal berstatus PENDING yang bisa direject. Status saat ini: ${journal.status}`);
      }

      const updated = await tx.journal.update({
        where: { id: journalId },
        data: { status: JournalStatus.REJECTED },
      });

      await tx.journalApprovalLog.create({
        data: {
          journalId,
          action: ApprovalAction.REJECTED,
          alasan,
          actorUserId,
        },
      });

      return updated;
    });
  }

  // Riwayat persetujuan
  async getApprovalHistory(tenantId: string) {
    return this.prisma.journalApprovalLog.findMany({
      where: {
        journal: {
          tenantId,
        },
      },
      include: {
        journal: {
          select: { no_voucher: true, tanggal: true, deskripsi: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
