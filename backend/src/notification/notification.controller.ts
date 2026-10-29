import { Controller, Get, Param, Patch, Query, HttpStatus } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('tenant/:tenantId')
  async getNotifications(
    @Param('tenantId') tenantId: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const isUnread = unreadOnly === 'true';
    const notifications = await this.notificationService.getNotifications(tenantId, isUnread);
    return {
      statusCode: HttpStatus.OK,
      message: 'Notifikasi berhasil diambil',
      data: notifications,
    };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    const notification = await this.notificationService.markAsRead(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Notifikasi ditandai sudah dibaca',
      data: notification,
    };
  }

  @Patch('tenant/:tenantId/read-all')
  async markAllAsRead(@Param('tenantId') tenantId: string) {
    await this.notificationService.markAllAsRead(tenantId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Semua notifikasi berhasil ditandai sudah dibaca',
    };
  }
}
