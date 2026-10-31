import { Controller, Get, Param, Query, HttpStatus } from '@nestjs/common';
import { IntegrationLogService } from './integration-log.service';

@Controller('internal/integration-logs')
export class IntegrationLogController {
  constructor(private readonly integrationLogService: IntegrationLogService) {}

  @Get('tenant/:tenantId')
  async getLogsByTenant(
    @Param('tenantId') tenantId: string,
    @Query('modul') modul?: string,
  ) {
    const logs = await this.integrationLogService.getLogsByTenant(tenantId, modul);
    return {
      statusCode: HttpStatus.OK,
      message: 'Log integrasi berhasil diambil',
      data: logs,
    };
  }
}
