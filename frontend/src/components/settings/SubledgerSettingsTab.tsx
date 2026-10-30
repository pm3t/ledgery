import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  Save,
  RotateCcw,
  ShieldAlert,
  Info,
  DollarSign,
  Package,
  FileCheck,
  CreditCard,
  Percent,
} from 'lucide-react';
import {
  api,
  Tenant,
  SubledgerSetting,
  PostingSetupItem,
  ChartOfAccount,
  ActivationCheckResult,
  PostingSetupKey,
} from '../../services/api';

interface SubledgerSettingsTabProps {
  currentTenant: Tenant | null;
}

// Definisi deskriptor untuk 15 kunci Posting Setup standar
interface KeyDescriptor {
  key: PostingSetupKey;
  label: string;
  categoryHint: string;
  allowedCategories: string[];
  module: 'AR' | 'AP' | 'INVENTORY' | 'GENERAL';
}

const POSTING_SETUP_KEYS: KeyDescriptor[] = [
  // AR Keys
  { key: 'AR_CONTROL', label: 'Piutang Usaha (AR Control)', categoryHint: 'ASET', allowedCategories: ['ASET'], module: 'AR' },
  { key: 'SALES_REVENUE', label: 'Pendapatan Penjualan', categoryHint: 'PENDAPATAN', allowedCategories: ['PENDAPATAN'], module: 'AR' },
  { key: 'SALES_DISCOUNT', label: 'Potongan Penjualan', categoryHint: 'PENDAPATAN / BEBAN', allowedCategories: ['PENDAPATAN', 'BEBAN'], module: 'AR' },
  { key: 'PPN_KELUARAN', label: 'PPN Keluaran (Pajak Pertambahan Nilai)', categoryHint: 'LIABILITAS', allowedCategories: ['LIABILITAS'], module: 'AR' },

  // AP Keys
  { key: 'AP_CONTROL', label: 'Hutang Usaha (AP Control)', categoryHint: 'LIABILITAS', allowedCategories: ['LIABILITAS'], module: 'AP' },
  { key: 'PURCHASE_EXPENSE', label: 'Beban Pembelian / Biaya', categoryHint: 'BEBAN / ASET', allowedCategories: ['BEBAN', 'ASET'], module: 'AP' },
  { key: 'PURCHASE_DISCOUNT', label: 'Potongan Pembelian', categoryHint: 'PENDAPATAN / BEBAN', allowedCategories: ['PENDAPATAN', 'BEBAN'], module: 'AP' },
  { key: 'PPN_MASUKAN', label: 'PPN Masukan (Pajak Masukan)', categoryHint: 'ASET', allowedCategories: ['ASET'], module: 'AP' },

  // Inventory Keys
  { key: 'INVENTORY', label: 'Akun Persediaan Barang (Inventory)', categoryHint: 'ASET', allowedCategories: ['ASET'], module: 'INVENTORY' },
  { key: 'COGS', label: 'Harga Pokok Penjualan (HPP / COGS)', categoryHint: 'BEBAN', allowedCategories: ['BEBAN'], module: 'INVENTORY' },
  { key: 'INVENTORY_ADJUSTMENT', label: 'Penyesuaian Persediaan (Adjustment Stock)', categoryHint: 'BEBAN / PENDAPATAN', allowedCategories: ['BEBAN', 'PENDAPATAN'], module: 'INVENTORY' },
  { key: 'GR_IR_CLEARING', label: 'Barang Diterima Belum Ditagih (GR/IR Clearing)', categoryHint: 'LIABILITAS', allowedCategories: ['LIABILITAS'], module: 'INVENTORY' },
  { key: 'PURCHASE_PRICE_VARIANCE', label: 'Selisih Harga Beli (Purchase Price Variance)', categoryHint: 'BEBAN', allowedCategories: ['BEBAN'], module: 'INVENTORY' },

  // General Keys
  { key: 'FX_GAIN_LOSS', label: 'Selisih Kurs Valuta Asing (FX Gain/Loss)', categoryHint: 'BEBAN / PENDAPATAN', allowedCategories: ['BEBAN', 'PENDAPATAN'], module: 'GENERAL' },
  { key: 'CASH_DEFAULT', label: 'Kas / Bank Penerimaan & Pembayaran Default', categoryHint: 'ASET', allowedCategories: ['ASET'], module: 'GENERAL' },
];

export const SubledgerSettingsTab: React.FC<SubledgerSettingsTabProps> = ({ currentTenant }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Subledger Settings Form State
  const [settings, setSettings] = useState<SubledgerSetting>({
    tenantId: '',
    arEnabled: false,
    apEnabled: false,
    inventoryEnabled: false,
    orderManagementEnabled: false,
    defaultValuationMethod: 'MOVING_AVERAGE',
    overDeliveryTolerancePct: 0,
    allowNegativeStock: false,
    creditLimitMode: 'WARN',
    agingBuckets: [30, 60, 90],
    blockPeriodCloseOnRecon: false,
  });

  // Aging buckets text representation for easy editing
  const [agingBucketsText, setAgingBucketsText] = useState('30, 60, 90');

  // COA List for account mapping
  const [coaList, setCoaList] = useState<ChartOfAccount[]>([]);

  // Posting Setups map: key -> accountId
  const [postingMap, setPostingMap] = useState<Record<string, string>>({});

  // Activation check result
  const [activationCheck, setActivationCheck] = useState<ActivationCheckResult | null>(null);

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [settingsData, postingData, coaData, checkData] = await Promise.all([
        api.getSubledgerSettings(currentTenant.id),
        api.getPostingSetups(currentTenant.id),
        api.getCoaByTenant(currentTenant.id),
        api.checkSubledgerActivation(currentTenant.id),
      ]);

      setSettings(settingsData);
      setAgingBucketsText((settingsData.agingBuckets || [30, 60, 90]).join(', '));
      setCoaList(coaData);
      setActivationCheck(checkData);

      // Map posting setups
      const map: Record<string, string> = {};
      postingData.forEach((item) => {
        if (!item.groupCode) {
          map[item.key] = item.accountId;
        }
      });
      setPostingMap(map);
    } catch (err: any) {
      console.error('Gagal memuat konfigurasi subledger:', err);
      setErrorMessage(err.message || 'Gagal memuat konfigurasi subledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant]);

  const handleSave = async () => {
    if (!currentTenant) return;
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      // Parse aging buckets
      const parsedBuckets = agingBucketsText
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      // 1. Simpan Subledger Settings
      await api.updateSubledgerSettings(currentTenant.id, {
        arEnabled: settings.arEnabled,
        apEnabled: settings.apEnabled,
        inventoryEnabled: settings.inventoryEnabled,
        orderManagementEnabled: settings.orderManagementEnabled,
        defaultValuationMethod: settings.defaultValuationMethod,
        overDeliveryTolerancePct: Number(settings.overDeliveryTolerancePct),
        allowNegativeStock: settings.allowNegativeStock,
        creditLimitMode: settings.creditLimitMode,
        agingBuckets: parsedBuckets.length > 0 ? parsedBuckets : [30, 60, 90],
        blockPeriodCloseOnRecon: settings.blockPeriodCloseOnRecon,
      });

      // 2. Simpan Posting Setups (batch)
      const batchItems = Object.entries(postingMap)
        .filter(([_, accId]) => !!accId)
        .map(([key, accountId]) => ({
          key,
          accountId,
        }));

      if (batchItems.length > 0) {
        await api.batchUpsertPostingSetups(currentTenant.id, batchItems);
      }

      // Refresh activation check
      const checkData = await api.checkSubledgerActivation(currentTenant.id);
      setActivationCheck(checkData);

      setSuccessMessage('Pengaturan subledger dan posting setup berhasil disimpan!');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Gagal menyimpan subledger setting:', err);
      setErrorMessage(err.message || 'Gagal menyimpan konfigurasi subledger');
    } finally {
      setSaving(false);
    }
  };

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Memuat pengaturan subledger...</div>;
  }

  // Cek apakah ada peringatan rekonsiliasi
  const hasReconWarnings =
    (activationCheck?.ar.enabled && !activationCheck.ar.reconciled) ||
    (activationCheck?.ap.enabled && !activationCheck.ap.reconciled) ||
    (activationCheck?.inventory.enabled && !activationCheck.inventory.reconciled);

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Layers className="w-7 h-7 text-indigo-400" />
          Pengaturan Fondasi Sub Ledger
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Konfigurasi aktivasi modul AR (Piutang), AP (Hutang), Persediaan, parameter operasional, dan pemetaan akun jurnal otomatis untuk{' '}
          <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>.
        </p>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800/60 rounded-2xl text-emerald-300 text-sm flex items-center gap-3 animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-950/60 border border-rose-800/60 rounded-2xl text-rose-300 text-sm flex items-center gap-3 animate-in fade-in duration-200">
          <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Banner Peringatan Rekonsiliasi Saldo Awal */}
      {hasReconWarnings && (
        <div className="p-5 bg-amber-950/40 border border-amber-500/40 rounded-2xl text-amber-200 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Peringatan Rekonsiliasi Saldo Awal Akun Kontrol</span>
          </div>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            Salah satu modul subledger aktif memiliki akun kontrol dengan saldo GL buku besar saat ini ≠ 0, namun saldo awal buku pembantu belum tercatat secara setara.
            Sistem menandai status ini sebagai <strong className="text-white">"Belum rekonsiliasi"</strong>.
          </p>
          <ul className="text-xs list-disc pl-5 space-y-1 text-amber-300/90 font-mono">
            {activationCheck?.ar.warnings.map((w, i) => (
              <li key={`ar-${i}`}>{w}</li>
            ))}
            {activationCheck?.ap.warnings.map((w, i) => (
              <li key={`ap-${i}`}>{w}</li>
            ))}
            {activationCheck?.inventory.warnings.map((w, i) => (
              <li key={`inv-${i}`}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 1. SEKSI AKTIVASI MODUL */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-white font-semibold text-lg border-b border-slate-800/80 pb-3">
          <FileCheck className="w-5 h-5 text-indigo-400" />
          Aktivasi Modul Sub Ledger
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AR Toggle */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                Accounts Receivable (AR)
                {settings.arEnabled && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                    AKTIF
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Buku pembantu piutang usaha per pelanggan, faktur penjualan, penerimaan piutang, dan umur piutang (aging).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={settings.arEnabled}
                onChange={(e) => setSettings({ ...settings, arEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* AP Toggle */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                Accounts Payable (AP)
                {settings.apEnabled && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                    AKTIF
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Buku pembantu hutang per vendor, tagihan supplier, pembayaran hutang, dan jadwal jatuh tempo pembayaran.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={settings.apEnabled}
                onChange={(e) => setSettings({ ...settings, apEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* Inventory Toggle */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                Inventory (Persediaan)
                {settings.inventoryEnabled && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                    AKTIF
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Kartu stok perpetual, penilaian barang (Moving Average / FIFO), penerimaan barang, dan penyesuaian stok.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={settings.inventoryEnabled}
                onChange={(e) => setSettings({ ...settings, inventoryEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* Order Management Toggle */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                Order Management
                {settings.orderManagementEnabled && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                    AKTIF
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Purchase Order (PO), Sales Order (SO), Delivery Order (DO), dan Goods Receipt (GR).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={settings.orderManagementEnabled}
                onChange={(e) => setSettings({ ...settings, orderManagementEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 2. SEKSI KEBIJAKAN & PARAMETER OPERASIONAL */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-2 text-white font-semibold text-lg border-b border-slate-800/80 pb-3">
          <CreditCard className="w-5 h-5 text-indigo-400" />
          Kebijakan & Parameter Operasional
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Metode Penilaian Persediaan */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Metode Penilaian Persediaan Default
            </label>
            <select
              value={settings.defaultValuationMethod}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultValuationMethod: e.target.value as 'MOVING_AVERAGE' | 'FIFO',
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 outline-none"
            >
              <option value="MOVING_AVERAGE">Moving Average (Rata-rata Bergerak)</option>
              <option value="FIFO">FIFO (First In First Out)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Metode penghitungan HPP dan saldo mutasi persediaan saat barang dikeluarkan.
            </p>
          </div>

          {/* Mode Limit Kredit */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Mode Validasi Limit Kredit Pelanggan
            </label>
            <select
              value={settings.creditLimitMode}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  creditLimitMode: e.target.value as 'WARN' | 'BLOCK',
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 outline-none"
            >
              <option value="WARN">Peringatan (WARN) - Izinkan transaksi dengan notifikasi</option>
              <option value="BLOCK">Kunci Keras (BLOCK) - Blokir pembuatan faktur/order melebihi limit</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Perilaku saat total piutang yang belum terbayar melampaui limit kredit mitra bisnis.
            </p>
          </div>

          {/* Toleransi Kelebihan Pengiriman (%) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Toleransi Kelebihan Pengiriman / Penerimaan (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={settings.overDeliveryTolerancePct}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    overDeliveryTolerancePct: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 outline-none pr-10"
              />
              <span className="absolute right-3.5 top-3 text-xs text-slate-500 font-semibold">%</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Batas toleransi kuantitas barang yang diterima melebihi PO (0% = tidak ada toleransi).
            </p>
          </div>

          {/* Bucket Umur Piutang / Hutang */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Bucket Umur Piutang / Aging (Hari)
            </label>
            <input
              type="text"
              value={agingBucketsText}
              onChange={(e) => setAgingBucketsText(e.target.value)}
              placeholder="30, 60, 90"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 outline-none"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Pisahkan dengan koma. Default: 30, 60, 90 (0-30 hari, 31-60 hari, 61-90 hari, &gt;90 hari).
            </p>
          </div>

          {/* Allow Negative Stock */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Izinkan Stok Negatif (Negative Stock)</div>
              <p className="text-xs text-slate-400 mt-1">
                Jika diaktifkan, transaksi pengeluaran barang diizinkan walau stok fisik sistem tidak mencukupi.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={settings.allowNegativeStock}
                onChange={(e) => setSettings({ ...settings, allowNegativeStock: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
            </label>
          </div>

          {/* Block Period Close on Recon Diff */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Blokir Tutup Periode Bila Rekonsiliasi Selisih</div>
              <p className="text-xs text-slate-400 mt-1">
                Mencegah penutupan periode akuntansi jika saldo akun kontrol GL ≠ rekapitulasi buku pembantu subledger.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={settings.blockPeriodCloseOnRecon}
                onChange={(e) => setSettings({ ...settings, blockPeriodCloseOnRecon: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 3. SEKSI POSTING SETUP (PEMETAAN AKUN PER KEY) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2 text-white font-semibold text-lg">
              <DollarSign className="w-5 h-5 text-indigo-400" />
              Posting Setup (Pemetaan Akun Jurnal Otomatis)
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Pilih akun buku besar (COA) yang akan digunakan mesin jurnal subledger saat mencatat transaksi.
            </p>
          </div>
        </div>

        {/* Grup Kunci Posting */}
        {(['AR', 'AP', 'INVENTORY', 'GENERAL'] as const).map((mod) => {
          const keys = POSTING_SETUP_KEYS.filter((k) => k.module === mod);
          const titleMap = {
            AR: 'Modul Piutang (Accounts Receivable)',
            AP: 'Modul Hutang (Accounts Payable)',
            INVENTORY: 'Modul Persediaan & HPP (Inventory)',
            GENERAL: 'Umum & Valuta Asing (General / FX / Cash)',
          };

          return (
            <div key={mod} className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-300/80 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800/80 inline-block">
                {titleMap[mod]}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {keys.map((desc) => {
                  const currentValue = postingMap[desc.key] || '';
                  // Filter COA yang cocok untuk rekomendasi
                  const filteredCoa = coaList.filter((a) => desc.allowedCategories.includes(a.kategori));

                  return (
                    <div
                      key={desc.key}
                      className="p-3.5 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">{desc.label}</span>
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {desc.categoryHint}
                        </span>
                      </div>

                      <select
                        value={currentValue}
                        onChange={(e) => setPostingMap({ ...postingMap, [desc.key]: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                      >
                        <option value="">-- Pilih Akun ({desc.categoryHint}) --</option>
                        {filteredCoa.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.kode_akun} - {acc.nama_akun} ({acc.kategori})
                            {acc.controlType && acc.controlType !== 'NONE' ? ` [Akun Kontrol ${acc.controlType}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Save Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={fetchData}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Form
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}
        </button>
      </div>
    </div>
  );
};
