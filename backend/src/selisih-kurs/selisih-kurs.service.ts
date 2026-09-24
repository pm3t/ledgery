import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SelisihKursService {
  private readonly logger = new Logger(SelisihKursService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Menghitung dan mencatat Jurnal Selisih Kurs (Realized Exchange Rate Difference)
   * 
   * Mekanisme:
   * 1. Deteksi akun yang merupakan Piutang (ASET) atau Utang (LIABILITAS)
   *    yang ditransaksikan dalam mata uang asing (docCurrency !== baseCurrency).
   * 2. Cari kurs saat pencatatan awal (historical rate).
   * 3. Cari kurs saat pelunasan (current rate).
   * 4. Bandingkan selisih antara nilai konversi awal dengan nilai konversi saat pelunasan.
   * 5. Generate otomatis Jurnal Penyesuaian ke akun "Laba/Rugi Selisih Kurs".
   */
  async calculateRealizedExchangeDifference(tenantId: string, invoiceJournalId: string, paymentJournalId: string) {
    // Catatan: Ini adalah kerangka (skeleton) logika untuk PRD V2.
    // Implementasi detail membutuhkan definisi yang jelas mengenai 
    // mana jurnal tagihan (invoice) dan mana jurnal pelunasan (payment),
    // serta mapping Chart of Account (CoA) untuk "Laba/Rugi Selisih Kurs".
    this.logger.log(`Menghitung selisih kurs untuk tenant: ${tenantId}`);
    return { status: 'Not implemented in MVP fully' };
  }
}
