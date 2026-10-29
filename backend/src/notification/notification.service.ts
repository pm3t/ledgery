import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // Listener untuk event saat jurnal berstatus PENDING
  @OnEvent('journal.pending')
  async handleJournalPendingEvent(payload: { tenantId: string; journalId: string; no_voucher: string }) {
    await this.prisma.notification.create({
      data: {
        tenantId: payload.tenantId,
        judul: 'Persetujuan Jurnal Diperlukan',
        pesan: `Jurnal baru dengan No Voucher ${payload.no_voucher} membutuhkan persetujuan Anda sebelum diposting ke Buku Besar.`,
      },
    });
  }

  // Mengambil daftar notifikasi per tenant
  async getNotifications(tenantId: string, unreadOnly: boolean = false) {
    const where: any = { tenantId };
    if (unreadOnly) {
      where.isRead = false;
    }
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50, // Batasi 50 notifikasi terakhir
    });
  }

  // Menandai notifikasi sebagai telah dibaca
  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  // Menandai semua notifikasi tenant sebagai telah dibaca
  async markAllAsRead(tenantId: string) {
    return this.prisma.notification.updateMany({
      where: { tenantId, isRead: false },
      data: { isRead: true },
    });
  }
}
