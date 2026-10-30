import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessPartnerService } from './business-partner.service';
import { BusinessPartnerController } from './business-partner.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessPartnerController],
  providers: [BusinessPartnerService],
  exports: [BusinessPartnerService],
})
export class BusinessPartnerModule {}

