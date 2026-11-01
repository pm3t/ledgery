import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FiscalGroupType,
  AssetCategoryType,
  DepreciationMethod,
  FiscalStartRule,
  FixedAssetStatus,
  AssetLabelStatus,
  ImpairmentAccumulationMode,
  AssetDisposalType,
} from '@prisma/client';

// =========================================================================
// 1. KELOMPOK PENYUSUTAN FISKAL (PMK 72/2023)
// =========================================================================

export class CreateFiscalGroupDto {
  @IsString()
  @IsNotEmpty()
  kode: string;

  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsEnum(FiscalGroupType)
  jenis: FiscalGroupType;

  @IsInt()
  @Min(1)
  masaManfaatBulan: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  tarifGarisLurus: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tarifSaldoMenurun?: number;
}

export class UpdateFiscalGroupDto {
  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  masaManfaatBulan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tarifGarisLurus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tarifSaldoMenurun?: number;
}

// =========================================================================
// 2. MASTER KATEGORI ASET TETAP
// =========================================================================

export class CreateAssetCategoryDto {
  @IsString()
  @IsNotEmpty()
  kode: string;

  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsOptional()
  @IsEnum(AssetCategoryType)
  jenis?: AssetCategoryType;

  @IsOptional()
  @IsBoolean()
  dapatDisusutkan?: boolean;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeKomersial?: DepreciationMethod;

  @IsOptional()
  @IsNumber()
  @Min(1)
  faktorSaldoMenurun?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  umurManfaatBulan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  nilaiResiduPersen?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nilaiResiduNominal?: number;

  @IsOptional()
  @IsString()
  fiscalGroupId?: string;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeFiskal?: DepreciationMethod;

  @IsOptional()
  @IsEnum(FiscalStartRule)
  aturanMulaiFiskal?: FiscalStartRule;

  @IsString()
  @IsNotEmpty()
  akunAsetId: string;

  @IsString()
  @IsNotEmpty()
  akunAkumulasiId: string;

  @IsString()
  @IsNotEmpty()
  akunBebanId: string;

  @IsString()
  @IsNotEmpty()
  akunCipId: string;

  @IsString()
  @IsNotEmpty()
  akunLabaRugiPelepasanId: string;

  @IsString()
  @IsNotEmpty()
  akunRugiPenurunanNilaiId: string;

  @IsOptional()
  @IsString()
  akunAkumulasiPenurunanNilaiId?: string;

  @IsString()
  @IsNotEmpty()
  akunRugiPenghapusanId: string;
}

export class UpdateAssetCategoryDto {
  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsBoolean()
  dapatDisusutkan?: boolean;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeKomersial?: DepreciationMethod;

  @IsOptional()
  @IsNumber()
  faktorSaldoMenurun?: number;

  @IsOptional()
  @IsInt()
  umurManfaatBulan?: number;

  @IsOptional()
  @IsNumber()
  nilaiResiduPersen?: number;

  @IsOptional()
  @IsNumber()
  nilaiResiduNominal?: number;

  @IsOptional()
  @IsString()
  fiscalGroupId?: string;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeFiskal?: DepreciationMethod;

  @IsOptional()
  @IsEnum(FiscalStartRule)
  aturanMulaiFiskal?: FiscalStartRule;

  @IsOptional()
  @IsString()
  akunAsetId?: string;

  @IsOptional()
  @IsString()
  akunAkumulasiId?: string;

  @IsOptional()
  @IsString()
  akunBebanId?: string;

  @IsOptional()
  @IsString()
  akunCipId?: string;

  @IsOptional()
  @IsString()
  akunLabaRugiPelepasanId?: string;

  @IsOptional()
  @IsString()
  akunRugiPenurunanNilaiId?: string;

  @IsOptional()
  @IsString()
  akunAkumulasiPenurunanNilaiId?: string;

  @IsOptional()
  @IsString()
  akunRugiPenghapusanId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// =========================================================================
// 3. KARTU ASET TETAP
// =========================================================================

export class CreateFixedAssetDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsString()
  tagCode?: string;

  @IsDateString()
  tanggalPerolehan: string;

  @IsOptional()
  @IsDateString()
  tanggalMulaiDigunakan?: string;

  @IsOptional()
  @IsString()
  mata_uang?: string;

  @IsOptional()
  @IsNumber()
  kurs?: number;

  @IsNumber()
  @Min(0)
  hargaPerolehanAsli: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nilaiResidu?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  umurManfaatBulan?: number;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeKomersial?: DepreciationMethod;

  @IsOptional()
  @IsNumber()
  faktorSaldoMenurun?: number;

  @IsOptional()
  @IsString()
  fiscalGroupId?: string;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeFiskal?: DepreciationMethod;

  @IsOptional()
  @IsDateString()
  fiskalMulaiTanggal?: string;

  @IsOptional()
  @IsInt()
  fiskalUmurOverrideBulan?: number;

  @IsOptional()
  dimensions?: any;

  @IsOptional()
  @IsBoolean()
  isCip?: boolean; // Jika true, dibuat dengan status CIP

  @IsOptional()
  @IsString()
  akunLawanId?: string; // Untuk manual registration (penyeimbang jurnal Dr Aset / Cr Akun Lawan)
}

export class UpdateFixedAssetDto {
  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsString()
  tagCode?: string;

  @IsOptional()
  @IsDateString()
  tanggalMulaiDigunakan?: string;

  @IsOptional()
  @IsNumber()
  nilaiResidu?: number;

  @IsOptional()
  @IsInt()
  umurManfaatBulan?: number;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeKomersial?: DepreciationMethod;

  @IsOptional()
  @IsNumber()
  faktorSaldoMenurun?: number;

  @IsOptional()
  @IsString()
  fiscalGroupId?: string;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeFiskal?: DepreciationMethod;

  @IsOptional()
  @IsDateString()
  fiskalMulaiTanggal?: string;

  @IsOptional()
  @IsInt()
  fiskalUmurOverrideBulan?: number;

  @IsOptional()
  dimensions?: any;

  @IsOptional()
  @IsEnum(AssetLabelStatus)
  statusLabel?: AssetLabelStatus;
}

// =========================================================================
// 4. OPERASI KHUSUS ASET
// =========================================================================

export class ActivateAssetDto {
  @IsDateString()
  tanggalMulaiDigunakan: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  umurManfaatBulan?: number;

  @IsOptional()
  @IsNumber()
  nilaiResidu?: number;
}

export class CapitalizeCipDto {
  @IsDateString()
  tanggal: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string; // Kategori akhir

  @IsDateString()
  tanggalMulaiDigunakan: string;
}

export class DuplicateNAssetDto {
  @IsInt()
  @Min(1)
  @Max(100)
  n: number;
}

export class ImportOpeningBalanceItemDto {
  @IsString()
  @IsNotEmpty()
  noAset: string;

  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsString()
  @IsNotEmpty()
  kategoriKode: string;

  @IsDateString()
  tanggalPerolehan: string;

  @IsOptional()
  @IsDateString()
  tanggalMulaiDigunakan?: string;

  @IsNumber()
  @Min(0)
  hargaPerolehan: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  akumulasiPenyusutanKomersial?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  akumulasiPenyusutanFiskal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sisaUmurBulan?: number;

  @IsOptional()
  @IsString()
  tagCode?: string;

  @IsOptional()
  dimensions?: any;
}

export class ImportOpeningBalanceDto {
  @Type(() => ImportOpeningBalanceItemDto)
  @ValidateNested({ each: true })
  items: ImportOpeningBalanceItemDto[];
}

// =========================================================================
// 5. PUBLIC API V1 DTO
// =========================================================================

export class UpsertFixedAssetV1Dto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsString()
  @IsNotEmpty()
  category_id: string;

  @IsDateString()
  tanggal_perolehan: string;

  @IsNumber()
  @Min(0)
  harga_perolehan: number;

  @IsOptional()
  @IsString()
  tag_code?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsString()
  mata_uang?: string;

  @IsOptional()
  @IsNumber()
  kurs?: number;

  @IsOptional()
  @IsNumber()
  nilai_residu?: number;

  @IsOptional()
  @IsInt()
  umur_manfaat_bulan?: number;

  @IsOptional()
  @IsBoolean()
  kapitalisasi_ke_cip?: boolean;

  @IsOptional()
  @IsString()
  akun_lawan_id?: string;

  @IsOptional()
  dimensions?: any;
}

// =========================================================================
// 6. PROSES PENYUSUTAN BULANAN (DEPRECIATION RUN & TRANSAKSI LANJUTAN)
// =========================================================================

export class PostDepreciationRunDto {
  @IsString()
  @IsNotEmpty()
  periodId: string;
}

export class AddCostAdditionDto {
  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @IsNumber()
  @Min(0.01)
  jumlah: number;

  @IsString()
  @IsNotEmpty()
  akunLawanId: string;

  @IsOptional()
  @IsString()
  sumber?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  dimensions?: any;
}

export class RecordEstimateChangeDto {
  @IsString()
  @IsNotEmpty()
  berlakuMulaiPeriode: string; // YYYY-MM

  @IsOptional()
  @IsInt()
  @Min(1)
  umurBaruBulan?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sisaUmurBulan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  residuBaru?: number;

  @IsOptional()
  @IsEnum(DepreciationMethod)
  metodeBaru?: DepreciationMethod;

  @IsString()
  @IsNotEmpty()
  alasan: string;
}

// =========================================================================
// 7. PERISTIWA SIKLUS HIDUP ASET LANJUTAN (MODUL 23)
// =========================================================================

export class TransferAssetDto {
  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @IsNotEmpty()
  ke: any; // Dimensi baru (JSON / Object)

  @IsString()
  @IsNotEmpty()
  alasan: string;
}

export class MassTransferItemDto {
  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsNotEmpty()
  ke: any;

  @IsOptional()
  @IsString()
  alasan?: string;
}

export class MassTransferDto {
  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @Type(() => MassTransferItemDto)
  @ValidateNested({ each: true })
  items: MassTransferItemDto[];

  @IsOptional()
  @IsString()
  alasanDefault?: string;
}

export class ImpairAssetDto {
  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @IsNumber()
  @Min(0.01)
  jumlah: number;

  @IsString()
  @IsNotEmpty()
  alasan: string;

  @IsOptional()
  @IsEnum(ImpairmentAccumulationMode)
  modeAkumulasi?: ImpairmentAccumulationMode;
}

export class DisposeAssetDto {
  @IsDateString()
  @IsNotEmpty()
  tanggal: string;

  @IsEnum(AssetDisposalType)
  tipe: AssetDisposalType;

  @IsString()
  @IsNotEmpty()
  alasan: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hargaJual?: number;

  @IsOptional()
  @IsString()
  cashBankAccountId?: string;
}



