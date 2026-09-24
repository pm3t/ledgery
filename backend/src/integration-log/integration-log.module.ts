import { Module } from '@nestjs/common';
import { IntegrationLogController } from './integration-log.controller';
import { IntegrationLogService } from './integration-log.service';

@Module({
  controllers: [IntegrationLogController],
  providers: [IntegrationLogService],
})
export class IntegrationLogModule {}
