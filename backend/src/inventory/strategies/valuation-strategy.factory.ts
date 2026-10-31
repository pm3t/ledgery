import { Injectable, BadRequestException } from '@nestjs/common';
import { InventoryValuationMethod } from '@prisma/client';
import { ValuationStrategy } from './valuation.strategy.interface';
import { MovingAverageStrategy } from './moving-average.strategy';
import { FifoStrategy } from './fifo.strategy';

@Injectable()
export class ValuationStrategyFactory {
  constructor(
    private readonly movingAverageStrategy: MovingAverageStrategy,
    private readonly fifoStrategy: FifoStrategy,
  ) {}

  getStrategy(method: InventoryValuationMethod): ValuationStrategy {
    switch (method) {
      case 'MOVING_AVERAGE':
        return this.movingAverageStrategy;
      case 'FIFO':
        return this.fifoStrategy;
      default:
        throw new BadRequestException(`Metode valuasi ${method} tidak didukung.`);
    }
  }
}

