import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';

@Injectable()
export class CurrencyService {
  constructor(private prisma: PrismaService) {}

  // --- GLOBAL CURRENCIES ---
  async getCurrencies() {
    return this.prisma.currency.findMany({
      where: { isActive: true },
      orderBy: { kode_iso: 'asc' },
    });
  }

  async createCurrency(kode_iso: string, nama: string) {
    return this.prisma.currency.create({
      data: { kode_iso, nama },
    });
  }

  // --- EXCHANGE RATES PER TENANT ---
  async getExchangeRates(tenantId: string, tanggal?: string, currencyId?: string) {
    const where: any = { tenantId };
    
    if (tanggal) {
      where.tanggal = new Date(tanggal);
    }
    
    if (currencyId) {
      where.currencyId = currencyId;
    }

    return this.prisma.exchangeRate.findMany({
      where,
      include: { currency: true },
      orderBy: { tanggal: 'desc' },
    });
  }

  async setExchangeRate(dto: CreateExchangeRateDto) {
    const { tenantId, currencyId, tanggal, kurs, createdBy } = dto;
    const dateObj = new Date(tanggal);

    // Cek apakah mata uang valid
    const currency = await this.prisma.currency.findUnique({
      where: { id: currencyId },
    });

    if (!currency) {
      throw new NotFoundException('Mata uang tidak ditemukan');
    }

    // Upsert kurs harian
    return this.prisma.exchangeRate.upsert({
      where: {
        tenantId_currencyId_tanggal: {
          tenantId,
          currencyId,
          tanggal: dateObj,
        },
      },
      update: {
        kurs,
        createdBy,
      },
      create: {
        tenantId,
        currencyId,
        tanggal: dateObj,
        kurs,
        createdBy,
      },
    });
  }

  // Fungsi utilitas untuk mendapatkan kurs (digunakan oleh modul lain)
  async getRateForDate(tenantId: string, currencyId: string, date: Date): Promise<number | null> {
    const rate = await this.prisma.exchangeRate.findUnique({
      where: {
        tenantId_currencyId_tanggal: {
          tenantId,
          currencyId,
          tanggal: new Date(date.toISOString().split('T')[0]),
        },
      },
    });

    return rate ? rate.kurs : null;
  }
}
