import React, { useState, useEffect } from 'react';
import {
  api,
  AccountingPeriod,
  AssetDepreciationRun,
  DepreciationPreviewResult,
  FiscalYear,
} from '../../services/api';
import {
  Calculator,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Receipt,
  Layers,
  ArrowRight,
  TrendingDown,
  Info,
  Clock,
  Check,
  X,
  FileSpreadsheet,
} from 'lucide-react';

interface DepreciationRunPageProps {
  currentTenant: any;
}

export const DepreciationRunPage: React.FC<DepreciationRunPageProps> = ({ currentTenant }) => {
  const [activeTab, setActiveTab] = useState<'run' | 'history'>('run');
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [preview, setPreview] = useState<DepreciationPreviewResult | null>(null);
  const [runs, setRuns] = useState<AssetDepreciationRun[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState<boolean>(false);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [posting, setPosting] = useState<boolean>(false);
  const [reversingRunId, setReversingRunId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'assets' | 'gl'>('assets');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  useEffect(() => {
    loadPeriods();
    loadRuns();
  }, [currentTenant]);

  const loadPeriods = async () => {
    try {
      setLoadingPeriods(true);
      const fys = await api.getFiscalYears();
      setFiscalYears(fys);

      // Ambil periode dari semua tahun buku aktif
      let allOpenPeriods: AccountingPeriod[] = [];
      for (const fy of fys) {
        const pList = await api.getAccountingPeriods(fy.id);
        allOpenPeriods = allOpenPeriods.concat(pList.filter((p) => p.status === 'OPEN'));
      }
      setPeriods(allOpenPeriods);

      if (allOpenPeriods.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(allOpenPeriods[0].id);
      }
    } catch (err: any) {
      console.error('Gagal memuat periode:', err);
    } finally {
      setLoadingPeriods(false);
    }
  };

  const loadRuns = async () => {
    try {
      const data = await api.getDepreciationRuns();
      setRuns(data);
    } catch (err: any) {
      console.error('Gagal memuat riwayat penyusutan:', err);
    }
  };

  const handleCalculatePreview = async () => {
    if (!selectedPeriodId) return;
    setLoadingPreview(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await api.getDepreciationPreview(selectedPeriodId);
      setPreview(res);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghitung simulasi penyusutan.');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecutePost = async () => {
    if (!selectedPeriodId) return;
    setPosting(true);
    setErrorMessage(null);
    try {
      const res = await api.postDepreciationRun(selectedPeriodId);
      setSuccessMessage(
        `Sukses! Penyusutan berhasil diposting dengan nomor dokumen ${res.run.noDokumen}. Jurnal GL Komersial otomatis diterbitkan.`,
      );
      setShowConfirmModal(false);
      setPreview(null);
      await loadRuns();
      setActiveTab('history');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal melakukan posting penyusutan.');
    } finally {
      setPosting(false);
    }
  };

  const handleReverseRun = async (runId: string, docNo: string) => {
    if (
      !window.confirm(
        `Apakah Anda yakin ingin membatalkan (reverse) proses penyusutan ${docNo}? Jurnal GL terkait akan dibalik otomatis.`,
      )
    ) {
      return;
    }

    setReversingRunId(runId);
    setErrorMessage(null);
    try {
      await api.reverseDepreciationRun(runId);
      setSuccessMessage(`Proses penyusutan ${docNo} berhasil dibatalkan.`);
      await loadRuns();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal membatalkan penyusutan.');
    } finally {
      setReversingRunId(null);
    }
  };

  const formatRupiah = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `Rp ${Number(val).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const selectedPeriodObj = periods.find((p) => p.id === selectedPeriodId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 border-[#c9d8c8]">
        <div>
          <h1 className="text-2xl font-bold text-[#142820] flex items-center gap-2">
            <Calculator className="w-7 h-7 text-[#166534]" />
            Proses Penyusutan Aset Tetap
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Eksekusi penyusutan bulanan buku Komersial (otomatis jurnal ke GL) dan buku paralel Fiskal (mengacu PMK 72/2023 tanpa jurnal GL).
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-[#edf2ea] p-1 rounded-lg border border-[#c9d8c8]">
          <button
            onClick={() => setActiveTab('run')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
              activeTab === 'run'
                ? 'bg-[#166534] text-white shadow-sm'
                : 'text-[#142820] hover:bg-[#dfe8dc]'
            }`}
          >
            Proses Periode Ini
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
              activeTab === 'history'
                ? 'bg-[#166534] text-white shadow-sm'
                : 'text-[#142820] hover:bg-[#dfe8dc]'
            }`}
          >
            Riwayat Penyusutan ({runs.length})
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">Terjadi Kesalahan</div>
            <div>{errorMessage}</div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-lg flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">Operasi Berhasil</div>
            <div>{successMessage}</div>
          </div>
        </div>
      )}

      {/* TAB 1: PROSES PERIODE INI */}
      {activeTab === 'run' && (
        <div className="space-y-6">
          {/* Period Selector Card */}
          <div className="bg-white rounded-xl border border-[#c9d8c8] p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#edf2ea] flex items-center justify-center text-[#166534]">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                    Pilih Periode Akuntansi Berjalan (Status OPEN)
                  </label>
                  <select
                    value={selectedPeriodId}
                    onChange={(e) => {
                      setSelectedPeriodId(e.target.value);
                      setPreview(null);
                    }}
                    className="mt-1 font-semibold text-[#142820] text-base border-gray-300 rounded-md focus:ring-[#166534] focus:border-[#166534] py-1.5 px-3 border"
                    disabled={loadingPeriods || periods.length === 0}
                  >
                    {periods.length === 0 ? (
                      <option value="">Tidak ada periode terbuka (OPEN)</option>
                    ) : (
                      periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          Periode {p.nomor_periode} ({p.tanggal_mulai.slice(0, 7)}) — Selesai:{' '}
                          {p.tanggal_selesai.slice(0, 10)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCalculatePreview}
                  disabled={!selectedPeriodId || loadingPreview}
                  className="px-5 py-2.5 rounded-lg bg-[#166534] text-white font-medium text-sm flex items-center gap-2 hover:bg-[#14532d] shadow-sm disabled:opacity-50"
                >
                  <Calculator className="w-4 h-4" />
                  {loadingPreview ? 'Menghitung Simulasi...' : 'Hitung Simulasi Penyusutan'}
                </button>
              </div>
            </div>

            {/* Quick Helper Note */}
            <div className="bg-[#edf2ea] border border-[#c9d8c8] rounded-lg p-3 text-xs text-[#142820] flex items-center gap-2">
              <Info className="w-4 h-4 text-[#166534] shrink-0" />
              <span>
                Simulasi ini memindai seluruh aset berstatus <strong>AKTIF</strong>. Aset yang belum disusutkan pada bulan lampau akan diakui sebagai <strong>penyusutan susulan (catch-up)</strong> pada periode berjalan.
              </span>
            </div>
          </div>

          {/* Preview Results */}
          {preview && (
            <div className="space-y-6">
              {/* Warnings Banner if any */}
              {preview.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    Peringatan Simulasi Penyusutan
                  </div>
                  <ul className="list-disc pl-7 text-xs space-y-1">
                    {preview.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Metrics Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-[#c9d8c8] p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Beban Komersial</span>
                    <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-800 rounded-full">
                      Dijurnal ke GL
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-[#142820] mt-2">
                    {formatRupiah(preview.totalKomersial)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Beban penyusutan buku akuntansi
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#c9d8c8] p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Beban Fiskal</span>
                    <span className="px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-800 rounded-full">
                      Buku Paralel
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-blue-900 mt-2">
                    {formatRupiah(preview.totalFiskal)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Mengacu PMK 72/2023 (tanpa jurnal)
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#c9d8c8] p-5 shadow-sm">
                  <span className="text-xs font-semibold text-gray-500 uppercase block">Jumlah Aset</span>
                  <div className="text-2xl font-bold text-[#142820] mt-2">
                    {preview.totalAssetsCount} <span className="text-sm font-normal text-gray-500">unit</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Aset disusutkan periode ini
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#c9d8c8] p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Aset Catch-Up</span>
                    {preview.catchUpAssetsCount > 0 && (
                      <span className="px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800 rounded-full">
                        Tertunggak
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-amber-900 mt-2">
                    {preview.catchUpAssetsCount} <span className="text-sm font-normal text-gray-500">unit</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Penyusutan susulan periode lalu
                  </div>
                </div>
              </div>

              {/* Sub-Tab Navigation */}
              <div className="flex items-center gap-2 border-b border-[#c9d8c8]">
                <button
                  onClick={() => setActiveSubTab('assets')}
                  className={`pb-3 px-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
                    activeSubTab === 'assets'
                      ? 'border-[#166534] text-[#166534]'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Rincian Beban per Aset ({preview.assets.length})
                </button>
                <button
                  onClick={() => setActiveSubTab('gl')}
                  className={`pb-3 px-3 font-semibold text-sm transition-all border-b-2 flex items-center gap-2 ${
                    activeSubTab === 'gl'
                      ? 'border-[#166534] text-[#166534]'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  Preview Jurnal GL Komersial
                </button>
              </div>

              {/* Sub-Tab Content: Assets Breakdown */}
              {activeSubTab === 'assets' && (
                <div className="bg-white rounded-xl border border-[#c9d8c8] overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#edf2ea] text-[#142820] text-xs font-semibold uppercase tracking-wider border-b border-[#c9d8c8]">
                        <tr>
                          <th className="py-3 px-4">No. Aset</th>
                          <th className="py-3 px-4">Nama Aset</th>
                          <th className="py-3 px-4">Kategori</th>
                          <th className="py-3 px-4 text-right">Nilai Buku Sblm</th>
                          <th className="py-3 px-4 text-right">Beban Komersial</th>
                          <th className="py-3 px-4 text-right">Beban Fiskal</th>
                          <th className="py-3 px-4 text-right">Nilai Buku Ssdh</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf2ea]">
                        {preview.assets.map((ast) => (
                          <tr key={ast.assetId} className="hover:bg-[#f7faf6]">
                            <td className="py-3 px-4 font-mono font-medium text-[#142820]">
                              {ast.noAset}
                            </td>
                            <td className="py-3 px-4 font-medium text-[#142820]">
                              {ast.nama}
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {ast.kategoriNama}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                              {formatRupiah(ast.nilaiTercatatSebelum)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-[#166534]">
                              {formatRupiah(ast.komersialBeban)}
                            </td>
                            <td className="py-3 px-4 text-right text-blue-800">
                              {formatRupiah(ast.fiskalBeban)}
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-[#142820]">
                              {formatRupiah(ast.nilaiTercatatSetelah)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {ast.isCatchUp ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                  Catch-Up ({ast.catchUpBulanCount} bln)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                  Normal
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-Tab Content: GL Journal Preview */}
              {activeSubTab === 'gl' && (
                <div className="bg-white rounded-xl border border-[#c9d8c8] overflow-hidden shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-[#142820] text-base">
                        Preview Jurnal Umum GL (Beban Penyusutan Komersial)
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Dikelompokkan berdasarkan pasangan akun dan dimensi analitik (Cost Center / Project)
                      </p>
                    </div>
                    {preview.glJournalPreview.isBalanced ? (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full font-medium text-xs flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Seimbang (Balanced)
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full font-medium text-xs flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> Tidak Seimbang
                      </span>
                    )}
                  </div>

                  <div className="border border-[#c9d8c8] rounded-lg overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#edf2ea] text-[#142820] text-xs font-semibold uppercase">
                        <tr>
                          <th className="py-2.5 px-4">Kode Akun</th>
                          <th className="py-2.5 px-4">Nama Akun</th>
                          <th className="py-2.5 px-4">Dimensi Analitik</th>
                          <th className="py-2.5 px-4 text-right">Debit</th>
                          <th className="py-2.5 px-4 text-right">Kredit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf2ea]">
                        {/* Debit Lines */}
                        {preview.glJournalPreview.debitLines.map((deb, idx) => (
                          <tr key={`deb-${idx}`} className="hover:bg-[#f7faf6]">
                            <td className="py-2.5 px-4 font-mono font-medium text-[#142820]">
                              {deb.kodeAkun}
                            </td>
                            <td className="py-2.5 px-4 text-[#142820]">{deb.namaAkun}</td>
                            <td className="py-2.5 px-4 text-xs text-gray-500">
                              {deb.dimensions ? JSON.stringify(deb.dimensions) : '-'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-semibold text-[#166534]">
                              {formatRupiah(deb.jumlah)}
                            </td>
                            <td className="py-2.5 px-4 text-right text-gray-400">-</td>
                          </tr>
                        ))}

                        {/* Credit Lines */}
                        {preview.glJournalPreview.creditLines.map((cred, idx) => (
                          <tr key={`cred-${idx}`} className="hover:bg-[#f7faf6]">
                            <td className="py-2.5 px-4 font-mono font-medium text-[#142820]">
                              {cred.kodeAkun}
                            </td>
                            <td className="py-2.5 px-4 text-[#142820]">{cred.namaAkun}</td>
                            <td className="py-2.5 px-4 text-xs text-gray-500">
                              {cred.dimensions ? JSON.stringify(cred.dimensions) : '-'}
                            </td>
                            <td className="py-2.5 px-4 text-right text-gray-400">-</td>
                            <td className="py-2.5 px-4 text-right font-semibold text-[#142820]">
                              {formatRupiah(cred.jumlah)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#edf2ea] font-bold text-xs text-[#142820]">
                        <tr>
                          <td colSpan={3} className="py-2.5 px-4 text-right uppercase">
                            Total Jurnal
                          </td>
                          <td className="py-2.5 px-4 text-right text-[#166534]">
                            {formatRupiah(preview.totalKomersial)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-[#142820]">
                            {formatRupiah(preview.totalKomersial)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Posting Bar */}
              <div className="bg-white rounded-xl border border-[#c9d8c8] p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-[#142820] text-base">
                    Siap untuk Melakukan Posting Penyusutan?
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Tindakan ini akan mengunci beban bulan ini, mencetak voucher jurnal GL komersial, dan memperbarui nilai buku seluruh kartu aset.
                  </div>
                </div>

                <button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={posting || preview.totalAssetsCount === 0}
                  className="px-6 py-3 rounded-lg bg-[#166534] text-white font-bold text-sm flex items-center gap-2 hover:bg-[#14532d] shadow transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Posting Penyusutan Periode {selectedPeriodObj?.nomor_periode}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RIWAYAT PENYUSUTAN */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-[#c9d8c8] overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[#c9d8c8] flex items-center justify-between">
            <h2 className="font-bold text-[#142820] text-base">
              Riwayat Proses Penyusutan Bulanan (AssetDepreciationRun)
            </h2>
            <button
              onClick={loadRuns}
              className="text-xs font-semibold text-[#166534] hover:underline"
            >
              Segarkan
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#edf2ea] text-[#142820] text-xs font-semibold uppercase tracking-wider border-b border-[#c9d8c8]">
                <tr>
                  <th className="py-3 px-4">No. Dokumen</th>
                  <th className="py-3 px-4">Periode</th>
                  <th className="py-3 px-4 text-right">Beban Komersial</th>
                  <th className="py-3 px-4 text-right">Beban Fiskal</th>
                  <th className="py-3 px-4">No. Jurnal GL</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Waktu Posting</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2ea]">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      Belum ada proses penyusutan yang dijalankan.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => (
                    <tr key={r.id} className="hover:bg-[#f7faf6]">
                      <td className="py-3 px-4 font-mono font-medium text-[#142820]">
                        {r.noDokumen}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#142820]">
                        {r.period?.fiscalYear?.nama_tahun_buku || 'FY'} - Periode {r.period?.nomor_periode}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[#166534]">
                        {formatRupiah(r.totalKomersial)}
                      </td>
                      <td className="py-3 px-4 text-right text-blue-800">
                        {formatRupiah(r.totalFiskal)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-600">
                        {r.journal?.no_voucher || '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {r.status === 'POSTED' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                            POSTED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                            REVERSED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500">
                        {new Date(r.postedAt).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {r.status === 'POSTED' ? (
                          <button
                            onClick={() => handleReverseRun(r.id, r.noDokumen)}
                            disabled={reversingRunId === r.id}
                            className="px-2.5 py-1 rounded bg-amber-50 text-amber-700 border border-amber-300 text-xs font-semibold hover:bg-amber-100 flex items-center gap-1 mx-auto disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {reversingRunId === r.id ? 'Membalik...' : 'Batalkan (Reverse)'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Dibatalkan</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-[#c9d8c8]">
            <div className="flex items-center gap-3 text-[#166534]">
              <div className="w-12 h-12 rounded-full bg-[#edf2ea] flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#142820]">
                  Konfirmasi Posting Penyusutan
                </h3>
                <p className="text-xs text-gray-500">
                  Periode: {preview?.period?.nama}
                </p>
              </div>
            </div>

            <div className="bg-[#edf2ea] p-4 rounded-lg space-y-2 text-sm text-[#142820]">
              <div className="flex justify-between">
                <span>Total Beban Komersial:</span>
                <span className="font-bold">{formatRupiah(preview?.totalKomersial)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Beban Fiskal (PMK 72/2023):</span>
                <span className="font-bold text-blue-900">{formatRupiah(preview?.totalFiskal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Aset Disusutkan:</span>
                <span className="font-bold">{preview?.totalAssetsCount} unit</span>
              </div>
              {preview && preview.catchUpAssetsCount > 0 && (
                <div className="flex justify-between text-amber-800 font-semibold pt-1 border-t border-[#c9d8c8]">
                  <span>Penyusutan Susulan (Catch-Up):</span>
                  <span>{preview.catchUpAssetsCount} aset</span>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              Jurnal GL komersial akan diterbitkan secara otomatis dan nilai tercatat aset akan diperbarui. Jika diperlukan, proses ini dapat dibatalkan (reverse) selama periode belum ditutup (closed).
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={posting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleExecutePost}
                disabled={posting}
                className="px-5 py-2 rounded-lg bg-[#166534] text-white text-sm font-bold hover:bg-[#14532d] shadow flex items-center gap-2"
              >
                {posting ? 'Memproses Posting...' : 'Ya, Posting Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
