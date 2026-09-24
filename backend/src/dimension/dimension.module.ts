import { Module } from '@nestjs/common';
import { DimensionService } from './dimension.service';
import { DimensionController } from './dimension.controller';

@Module({
  providers: [DimensionService],
  controllers: [DimensionController]
})
export class DimensionModule {}
