import { Controller, Get, Post, Param, Body, HttpStatus } from '@nestjs/common';
import { JournalApprovalService } from './journal-approval.service';
import { RejectJournalDto } from './dto/reject-journal.dto';

@Controller('internal/journals')
export class JournalApprovalController {
  constructor(private readonly approvalService: JournalApprovalService) {}

  @Get('pending/:tenantId')
  async getPendingJournals(@Param('tenantId') tenantId: string) {
    const journals = await this.approvalService.getPendingJournals(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar jurnal PENDING berhasil diambil',
      data: journals,
    };
  }

  @Post(':id/approve')
  async approveJournal(
    @Param('id') journalId: string,
    @Body('tenantId') tenantId: string,
    @Body('actorUserId') actorUserId: string,
  ) {
    const journal = await this.approvalService.approveJournal(tenantId, journalId, actorUserId || 'staff-akuntansi-01');
    return {
      statusCode: HttpStatus.OK,
      message: 'Jurnal berhasil disetujui',
      data: journal,
    };
  }

  @Post(':id/reject')
  async rejectJournal(
    @Param('id') journalId: string,
    @Body('tenantId') tenantId: string,
    @Body('actorUserId') actorUserId: string,
    @Body() rejectDto: RejectJournalDto,
  ) {
    const journal = await this.approvalService.rejectJournal(tenantId, journalId, rejectDto.alasan, actorUserId || 'staff-akuntansi-01');
    return {
      statusCode: HttpStatus.OK,
      message: 'Jurnal berhasil ditolak',
      data: journal,
    };
  }

  @Get('approval-history/:tenantId')
  async getApprovalHistory(@Param('tenantId') tenantId: string) {
    const history = await this.approvalService.getApprovalHistory(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Riwayat approval berhasil diambil',
      data: history,
    };
  }
}
