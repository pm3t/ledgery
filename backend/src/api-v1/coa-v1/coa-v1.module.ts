import { Module } from '@nestjs/common';
import { CoaV1Controller } from './coa-v1.controller';
import { ChartOfAccountModule } from '../../chart-of-account/chart-of-account.module';

@Module({
  imports: [ChartOfAccountModule],
  controllers: [CoaV1Controller],
})
export class CoaV1Module {}
