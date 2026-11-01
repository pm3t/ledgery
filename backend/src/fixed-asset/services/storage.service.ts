import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class AssetStorageService {
  private readonly logger = new Logger(AssetStorageService.name);
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads', 'assets');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Menyimpan buffer file ke media penyimpanan lokal.
   * Format abstraction ini siap dialihkan ke S3-compatible bila diperlukan.
   */
  async saveFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ storageKey: string; ukuran: number; namaFile: string; tipe: string }> {
    const ext = path.extname(originalName);
    const storageKey = `${Date.now()}-${randomUUID()}${ext}`;
    const filePath = path.join(this.uploadDir, storageKey);

    await fs.promises.writeFile(filePath, fileBuffer);

    return {
      storageKey,
      ukuran: fileBuffer.length,
      namaFile: originalName,
      tipe: mimeType,
    };
  }

  /**
   * Mengambil path file lokal untuk pengunduhan / streaming.
   */
  getFilePath(storageKey: string): string {
    const safeKey = path.basename(storageKey);
    return path.join(this.uploadDir, safeKey);
  }

  /**
   * Menghapus file dari media penyimpanan.
   */
  async deleteFile(storageKey: string): Promise<void> {
    try {
      const filePath = this.getFilePath(storageKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err: any) {
      this.logger.error(`Gagal menghapus file ${storageKey}: ${err.message}`);
    }
  }
}

