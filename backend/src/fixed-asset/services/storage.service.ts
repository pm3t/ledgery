import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

@Injectable()
export class AssetStorageService {
  private readonly logger = new Logger(AssetStorageService.name);
  private readonly uploadDir: string;

  constructor() {
    // Di lingkungan serverless (Vercel / AWS Lambda), filesystem root /var/task bersifat read-only.
    // Gunakan direktori sementara /tmp yang berstatus writable.
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    this.uploadDir =
      process.env.UPLOAD_DIR ||
      (isServerless
        ? path.join(os.tmpdir(), 'uploads', 'assets')
        : path.resolve(process.cwd(), 'uploads', 'assets'));

    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
    } catch (err: any) {
      this.logger.warn(`Peringatan: Gagal membuat direktori upload (${this.uploadDir}): ${err.message}`);
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

    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
      await fs.promises.writeFile(filePath, fileBuffer);
    } catch (err: any) {
      this.logger.error(`Gagal menyimpan file ke ${filePath}: ${err.message}`);
      throw err;
    }

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

