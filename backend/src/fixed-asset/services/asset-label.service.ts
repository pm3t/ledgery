import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TagCodeService } from './tag-code.service';
import { CreateLabelTemplateDto, UpdateLabelTemplateDto, PrintLabelsDto } from '../dto/asset-label.dto';
import { AssetLabelStatus, FixedAssetStatus, LabelSymbology } from '@prisma/client';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as QRCode from 'qrcode';
import * as bwipjs from 'bwip-js';

// Konstanta konversi 1 mm ke Points (PostScript/PDF: 72 points per inch; 25.4 mm per inch)
const MM_TO_PT = 72 / 25.4;

@Injectable()
export class AssetLabelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagCodeService: TagCodeService,
  ) {}

  /**
   * Mengambil semua template label milik tenant.
   * Jika tenant belum memiliki template, secara otomatis seed 3 preset standar:
   * 1. Label Kecil (50 × 25 mm)
   * 2. Label Standar (70 × 30 mm)
   * 3. Lembar A4 (3 × 8 Label - 24 Label)
   */
  async getTemplates(tenantId: string) {
    const existing = await this.prisma.assetLabelTemplate.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    if (existing.length > 0) {
      return existing;
    }

    // Seed preset templates
    await this.seedPresetTemplates(tenantId);

    return this.prisma.assetLabelTemplate.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Seed preset template label standar untuk tenant baru
   */
  async seedPresetTemplates(tenantId: string) {
    const presets = [
      {
        tenantId,
        nama: 'Label Kecil (50 × 25 mm)',
        lebarMm: 50,
        tinggiMm: 25,
        simbologi: LabelSymbology.QR,
        layout: {
          showCompany: true,
          showAssetName: true,
          showNoAset: true,
          showCategory: false,
          showLocation: false,
          showYear: false,
          qrSizeMm: 16,
          fontSizePt: 7,
        },
        lembar: null,
        isDefault: true,
      },
      {
        tenantId,
        nama: 'Label Standar (70 × 30 mm)',
        lebarMm: 70,
        tinggiMm: 30,
        simbologi: LabelSymbology.QR,
        layout: {
          showCompany: true,
          showAssetName: true,
          showNoAset: true,
          showCategory: true,
          showLocation: true,
          showYear: true,
          qrSizeMm: 20,
          fontSizePt: 8,
        },
        lembar: null,
        isDefault: false,
      },
      {
        tenantId,
        nama: 'Lembar A4 (3 × 8 Label)',
        lebarMm: 70,
        tinggiMm: 36,
        simbologi: LabelSymbology.QR,
        layout: {
          showCompany: true,
          showAssetName: true,
          showNoAset: true,
          showCategory: true,
          showLocation: true,
          showYear: true,
          qrSizeMm: 22,
          fontSizePt: 7.5,
        },
        lembar: {
          tipe: 'A4',
          kolom: 3,
          baris: 8,
          marginKiriMm: 0,
          marginAtasMm: 4.5,
          jarakHorisontalMm: 0,
          jarakVertikalMm: 0,
        },
        isDefault: false,
      },
    ];

    for (const p of presets) {
      await this.prisma.assetLabelTemplate.create({ data: p });
    }
  }

  /**
   * Membuat template label baru
   */
  async createTemplate(tenantId: string, dto: CreateLabelTemplateDto) {
    if (dto.isDefault) {
      // Lepas status default dari template lain
      await this.prisma.assetLabelTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.assetLabelTemplate.create({
      data: {
        tenantId,
        nama: dto.nama,
        lebarMm: dto.lebarMm,
        tinggiMm: dto.tinggiMm,
        layout: dto.layout,
        simbologi: dto.simbologi || LabelSymbology.QR,
        lembar: dto.lembar || null,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  /**
   * Memperbarui template label
   */
  async updateTemplate(tenantId: string, id: string, dto: UpdateLabelTemplateDto) {
    const template = await this.prisma.assetLabelTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      throw new NotFoundException('Template label tidak ditemukan.');
    }

    if (dto.isDefault) {
      await this.prisma.assetLabelTemplate.updateMany({
        where: { tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.assetLabelTemplate.update({
      where: { id },
      data: {
        ...(dto.nama !== undefined && { nama: dto.nama }),
        ...(dto.lebarMm !== undefined && { lebarMm: dto.lebarMm }),
        ...(dto.tinggiMm !== undefined && { tinggiMm: dto.tinggiMm }),
        ...(dto.layout !== undefined && { layout: dto.layout }),
        ...(dto.simbologi !== undefined && { simbologi: dto.simbologi }),
        ...(dto.lembar !== undefined && { lembar: dto.lembar }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  /**
   * Menetapkan template sebagai default
   */
  async setDefaultTemplate(tenantId: string, id: string) {
    await this.prisma.assetLabelTemplate.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });

    return this.prisma.assetLabelTemplate.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  /**
   * Menghapus template label
   */
  async deleteTemplate(tenantId: string, id: string) {
    const template = await this.prisma.assetLabelTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      throw new NotFoundException('Template label tidak ditemukan.');
    }

    await this.prisma.assetLabelTemplate.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Merender label aset menjadi berkas PDF ukuran milimeter akurat.
   * Mendukung pencetakan satu aset, daftar aset terpilih, atau massal berdasarkan filter.
   * Hanya aset berstatus AKTIF atau DISUSUTKAN_PENUH yang dapat dicetak (CIP ditolak).
   * Cetak ulang (aset yang sudah pernah dicetak/terpasang/rusak) mewajibkan alasan.
   */
  async renderLabelsPdf(
    tenantId: string,
    dto: PrintLabelsDto,
    user: { id: string; nama?: string; role?: string },
  ): Promise<{ pdfBuffer: Buffer; count: number }> {
    // 1. Ambil template
    const template = await this.prisma.assetLabelTemplate.findFirst({
      where: { id: dto.templateId, tenantId },
    });
    if (!template) {
      throw new NotFoundException('Template label yang dipilih tidak ditemukan.');
    }

    // 2. Kueri aset yang akan dicetak
    const where: any = { tenantId };

    if (dto.assetIds && dto.assetIds.length > 0) {
      where.id = { in: dto.assetIds };
    } else if (dto.filter) {
      if (dto.filter.categoryId) where.categoryId = dto.filter.categoryId;
      if (dto.filter.statusLabel) where.statusLabel = dto.filter.statusLabel;
      if (dto.filter.onlyUnlabelled) where.statusLabel = AssetLabelStatus.BELUM_DILABEL;
    } else {
      throw new BadRequestException('Pilih aset atau tentukan kriteria filter aset untuk dicetak.');
    }

    const assets = await this.prisma.fixedAsset.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: { noAset: 'asc' },
    });

    if (assets.length === 0) {
      throw new BadRequestException('Tidak ada aset yang cocok dengan filter yang dipilih untuk dicetak.');
    }

    // 3. Validasi status aset: Hanya AKTIF / DISUSUTKAN_PENUH (CIP dilarang dicetak sebelum kapitalisasi)
    for (const a of assets) {
      if (a.status === FixedAssetStatus.CIP) {
        throw new BadRequestException(
          `Aset "${a.noAset} - ${a.nama}" masih berstatus Konstruksi Dalam Pengerjaan (CIP). Label hanya dapat dicetak setelah aset dikapitalisasi.`,
        );
      }
      if (a.status !== FixedAssetStatus.AKTIF && a.status !== FixedAssetStatus.DISUSUTKAN_PENUH) {
        throw new BadRequestException(
          `Aset "${a.noAset} - ${a.nama}" berstatus ${a.status}. Label hanya dapat dicetak untuk aset yang berstatus AKTIF atau DISUSUTKAN_PENUH.`,
        );
      }
    }

    // 4. Cek apakah ada aset yang memerlukan alasan cetak ulang
    const isReprint = assets.some(
      (a) => a.statusLabel !== AssetLabelStatus.BELUM_DILABEL,
    );
    if (isReprint && (!dto.alasan || !dto.alasan.trim())) {
      throw new BadRequestException(
        'Alasan cetak ulang wajib dicantumkan jika ada aset yang sudah pernah dicetak atau terpasang labelnya.',
      );
    }

    // 5. Ambil data nama tenant untuk label dan awalan QR
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nama_perusahaan: true },
    });
    const companyName = tenant?.nama_perusahaan || 'LEDGERY';
    const tenantPrefix = await this.tagCodeService.getTenantPrefix(tenantId);

    // 6. Siapkan dokumen PDF
    const pdfDoc = await PDFDocument.create();
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const layout = (template.layout as any) || {};
    const lembar = template.lembar as any;

    if (lembar && lembar.kolom && lembar.baris) {
      // Mode Lembar Multi-Label (misalnya A4 grid: 3 kolom × 8 baris)
      const a4WidthPt = 210 * MM_TO_PT; // 595.28 pt
      const a4HeightPt = 297 * MM_TO_PT; // 841.89 pt
      const labelW = template.lebarMm * MM_TO_PT;
      const labelH = template.tinggiMm * MM_TO_PT;
      const cols = Number(lembar.kolom) || 3;
      const rows = Number(lembar.baris) || 8;
      const marginX = (lembar.marginKiriMm || 0) * MM_TO_PT;
      const marginY = (lembar.marginAtasMm || 0) * MM_TO_PT;
      const gapX = (lembar.jarakHorisontalMm || 0) * MM_TO_PT;
      const gapY = (lembar.jarakVertikalMm || 0) * MM_TO_PT;

      const labelsPerPage = cols * rows;
      let currentPage: any = null;

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const pageIndex = Math.floor(i / labelsPerPage);
        const indexOnPage = i % labelsPerPage;

        if (indexOnPage === 0) {
          currentPage = pdfDoc.addPage([a4WidthPt, a4HeightPt]);
        }

        const col = indexOnPage % cols;
        const row = Math.floor(indexOnPage / cols);

        const x = marginX + col * (labelW + gapX);
        const y = a4HeightPt - marginY - (row + 1) * labelH - row * gapY;

        await this.drawSingleLabelOnPage(
          pdfDoc,
          currentPage,
          x,
          y,
          labelW,
          labelH,
          asset,
          companyName,
          tenantPrefix,
          template.simbologi,
          layout,
          helveticaBold,
          helvetica,
        );
      }
    } else {
      // Mode Printer Termal / Single Label per Halaman
      const pageW = template.lebarMm * MM_TO_PT;
      const pageH = template.tinggiMm * MM_TO_PT;

      for (const asset of assets) {
        const page = pdfDoc.addPage([pageW, pageH]);
        await this.drawSingleLabelOnPage(
          pdfDoc,
          page,
          0,
          0,
          pageW,
          pageH,
          asset,
          companyName,
          tenantPrefix,
          template.simbologi,
          layout,
          helveticaBold,
          helvetica,
        );
      }
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // 7. Perbarui status label aset menjadi TERCETAK
    const assetIds = assets.map((a) => a.id);
    await this.prisma.fixedAsset.updateMany({
      where: { id: { in: assetIds }, tenantId },
      data: { statusLabel: AssetLabelStatus.TERCETAK },
    });

    // 8. Catat log pencetakan
    await this.prisma.assetLabelPrintLog.create({
      data: {
        tenantId,
        templateId: template.id,
        assetIds: assetIds,
        jumlah: assets.length,
        alasan: dto.alasan?.trim() || null,
        printedBy: user.nama || user.id || 'System',
      },
    });

    return {
      pdfBuffer,
      count: assets.length,
    };
  }

  /**
   * Menggambar satu label pada posisi x, y di sebuah halaman PDF
   */
  private async drawSingleLabelOnPage(
    pdfDoc: PDFDocument,
    page: any,
    x: number,
    y: number,
    w: number,
    h: number,
    asset: any,
    companyName: string,
    tenantPrefix: string,
    simbologi: LabelSymbology,
    layout: any,
    fontBold: any,
    fontRegular: any,
  ) {
    const pad = 3 * MM_TO_PT; // Margin dalam 3mm
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;

    // Tentukan ukuran QR / Barcode
    const qrMm = layout.qrSizeMm || Math.min(22, templateHeightFallback(h / MM_TO_PT));
    const qrSizePt = Math.min(qrMm * MM_TO_PT, innerH);

    // Buat gambar QR Code (HANYA berisi kode tag dengan awalan tenant, tanpa data finansial)
    const qrContent = `${tenantPrefix}:${asset.tagCode}`;
    const qrBuffer = await QRCode.toBuffer(qrContent, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 256,
    });
    const qrImage = await pdfDoc.embedPng(qrBuffer);

    // Posisi QR di sisi kiri
    const qrX = x + pad;
    const qrY = y + (h - qrSizePt) / 2;
    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSizePt,
      height: qrSizePt,
    });

    // Sisi kanan untuk teks informasi aset
    const textX = qrX + qrSizePt + 2 * MM_TO_PT;
    const textMaxW = x + w - pad - textX;
    let currentY = y + h - pad - 6;

    // Baris 1: Nama Perusahaan
    if (layout.showCompany !== false) {
      page.drawText(truncateText(companyName, 26), {
        x: textX,
        y: currentY,
        size: 6.5,
        font: fontBold,
        color: rgb(0.1, 0.2, 0.15),
      });
      currentY -= 9;
    }

    // Baris 2: Nama Aset
    if (layout.showAssetName !== false) {
      page.drawText(truncateText(asset.nama, 24), {
        x: textX,
        y: currentY,
        size: 7.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      currentY -= 9;
    }

    // Baris 3: Nomor Aset & Tag Code
    if (layout.showNoAset !== false) {
      page.drawText(`No: ${asset.noAset}`, {
        x: textX,
        y: currentY,
        size: 6.5,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
      currentY -= 8;

      page.drawText(`Tag: ${asset.tagCode}`, {
        x: textX,
        y: currentY,
        size: 7,
        font: fontBold,
        color: rgb(0.05, 0.35, 0.15),
      });
      currentY -= 8;
    }

    // Baris 4: Kategori & Lokasi/Cost Center (jika muat)
    if (layout.showCategory && asset.category?.nama && currentY > y + pad) {
      page.drawText(`Kat: ${truncateText(asset.category.nama, 20)}`, {
        x: textX,
        y: currentY,
        size: 6,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });
      currentY -= 7.5;
    }

    // Baris 5: Tahun Perolehan
    if (layout.showYear && asset.tanggalPerolehan && currentY > y + pad) {
      const year = new Date(asset.tanggalPerolehan).getFullYear();
      page.drawText(`Thn: ${year}`, {
        x: textX,
        y: currentY,
        size: 6,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    // Opsional: Barcode Code 128 jika simbologi meminta Code 128 atau Both
    if (simbologi === LabelSymbology.CODE128 || simbologi === LabelSymbology.BOTH) {
      try {
        const barcodeBuffer = await bwipjs.toBuffer({
          bcid: 'code128',
          text: asset.tagCode,
          scale: 2,
          height: 8,
          includetext: false,
        });
        const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
        const bcW = Math.min(textMaxW, 35 * MM_TO_PT);
        const bcH = 6 * MM_TO_PT;
        page.drawImage(barcodeImage, {
          x: textX,
          y: y + pad,
          width: bcW,
          height: bcH,
        });
      } catch (err) {
        // Fallback jika Code 128 gagal render
      }
    }
  }

  /**
   * Laporan ringkasan status pelabelan aset tenant
   */
  async getLabelingStatusReport(tenantId: string) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: {
        tenantId,
        status: { in: [FixedAssetStatus.AKTIF, FixedAssetStatus.DISUSUTKAN_PENUH] },
      },
      select: {
        id: true,
        statusLabel: true,
        categoryId: true,
        category: { select: { nama: true } },
        dimensions: true,
      },
    });

    const summary = {
      total: assets.length,
      belumDilabel: 0,
      tercetak: 0,
      terpasang: 0,
      rusakHilang: 0,
    };

    const byCategory: Record<string, { nama: string; belum: number; tercetak: number; terpasang: number; rusak: number; total: number }> = {};

    for (const a of assets) {
      const st = a.statusLabel;
      if (st === AssetLabelStatus.BELUM_DILABEL) summary.belumDilabel++;
      else if (st === AssetLabelStatus.TERCETAK) summary.tercetak++;
      else if (st === AssetLabelStatus.TERPASANG) summary.terpasang++;
      else if (st === AssetLabelStatus.RUSAK_HILANG) summary.rusakHilang++;

      const catName = a.category?.nama || 'Tanpa Kategori';
      if (!byCategory[a.categoryId]) {
        byCategory[a.categoryId] = {
          nama: catName,
          belum: 0,
          tercetak: 0,
          terpasang: 0,
          rusak: 0,
          total: 0,
        };
      }
      byCategory[a.categoryId].total++;
      if (st === AssetLabelStatus.BELUM_DILABEL) byCategory[a.categoryId].belum++;
      else if (st === AssetLabelStatus.TERCETAK) byCategory[a.categoryId].tercetak++;
      else if (st === AssetLabelStatus.TERPASANG) byCategory[a.categoryId].terpasang++;
      else if (st === AssetLabelStatus.RUSAK_HILANG) byCategory[a.categoryId].rusak++;
    }

    return {
      summary,
      byCategory: Object.values(byCategory),
    };
  }

  /**
   * Riwayat log pencetakan label
   */
  async getPrintLogs(tenantId: string, limit: number = 20) {
    return this.prisma.assetLabelPrintLog.findMany({
      where: { tenantId },
      include: { template: { select: { nama: true, lebarMm: true, tinggiMm: true } } },
      orderBy: { printedAt: 'desc' },
      take: limit,
    });
  }
}

function truncateText(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function templateHeightFallback(heightMm: number): number {
  return Math.max(12, heightMm - 8);
}

