import React, { useState, useEffect } from 'react';
import {
  Landmark,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Layers,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  Ban,
  Plus,
  Trash2,
  Check,
  X,
  FileText,
  Sliders,
  AlertTriangle,
  Scale,
  History,
} from 'lucide-react';
import {
  api,
  CashBankAccount,
  BankStatementLine,
  CashBankEntry,
  BankAutoMatchRecommendation,
  BankReconciliationSummary,
  BankImportTemplate,
  ChartOfAccount,
} from '../../services/api';

/**
 * Halaman Rekonsiliasi Bank (Modul 20)
 * Alur 3 Langkah:
 * 1. Impor Rekening Koran (Upload CSV/Excel, Wizard Pemetaan Kolom, Simpan Template)
 * 2. Pencocokan Dua Panel (Rekening Koran vs Buku Kas, Auto-Match, Manual, Adjustment, Ignore)
 * 3. Ringkasan & Penyelesaian (Saldo Bank Disesuaikan, Item Beredar, Selisih = 0, Tombol Selesai)
 */
interface Props {
  onNavigateToHistory?: () => void;
}

export const BankReconciliationPage: React.FC<Props> = ({ onNavigateToHistory }) => {
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [tanggalAkhir, setTanggalAkhir] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(2);

  // Data State
  const [statementLines, setStatementLines] = useState<BankStatementLine[]>([]);
  const [bookEntries, setBookEntries] = useState<CashBankEntry[]>([]);
  const [autoMatches, setAutoMatches] = useState<BankAutoMatchRecommendation[]>([]);
  const [summary, setSummary] = useState<BankReconciliationSummary | null>(null);
  const [template, setTemplate] = useState<BankImportTemplate | null>(null);
  const [coaList, setCoaList] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter & Search Panel
  const [stmtFilter, setStmtFilter] = useState<'ALL' | 'UNMATCHED' | 'MATCHED' | 'ADJUSTED' | 'IGNORED'>('ALL');
  const [searchStmt, setSearchStmt] = useState('');
  const [searchBook, setSearchBook] = useState('');

  // Modal / Form States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [customTemplate, setCustomTemplate] = useState({
    tanggalCol: 0,
    keteranganCol: 1,
    referensiCol: 2,
    debitCol: 3,
    kreditCol: 4,
    nominalCol: 3,
    saldoCol: 5,
    startRow: 1,
    formatTanggal: 'DD/MM/YYYY',
    pemisahDesimal: ',',
    pemisahRibuan: '.',
    modeNominal: 'DEBIT_KREDIT_TERPISAH' as 'DEBIT_KREDIT_TERPISAH' | 'SATU_KOLOM_BERTANDA',
  });
  const [saveTemplateChecked, setSaveTemplateChecked] = useState(true);

  // Manual Matching Selection
  const [selectedStmtLineId, setSelectedStmtLineId] = useState<string | null>(null);
  const [selectedBookEntryIds, setSelectedBookEntryIds] = useState<string[]>([]);

  // Adjustment Modal
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentStmtLine, setAdjustmentStmtLine] = useState<BankStatementLine | null>(null);
  const [adjustmentAkunId, setAdjustmentAkunId] = useState('');
  const [adjustmentKeterangan, setAdjustmentKeterangan] = useState('');

  // Ignore Modal
  const [isIgnoreModalOpen, setIsIgnoreModalOpen] = useState(false);
  const [ignoreStmtLineId, setIgnoreStmtLineId] = useState<string | null>(null);
  const [ignoreReason, setIgnoreReason] = useState('');

  // Input Saldo Rekening Koran Manual pada Step 3
  const [customSaldoKoran, setCustomSaldoKoran] = useState<number | undefined>(undefined);

  // Ambil daftar rekening kas/bank saat halaman dimuat
  useEffect(() => {
    fetchAccounts();
    fetchCoa();
  }, []);

  // Ambil data mutasi dan buku saat rekening atau tanggal akhir berubah
  useEffect(() => {
    if (selectedAccountId) {
      loadAccountData();
    }
  }, [selectedAccountId, tanggalAkhir]);

  const fetchAccounts = async () => {
    try {
      const res = await api.getCashAccounts();
      // Rekonsiliasi utamanya untuk rekening jenis BANK dan DOMPET_DIGITAL
      const bankAccounts = res.filter((a) => a.jenis === 'BANK' || a.jenis === 'DOMPET_DIGITAL');
      setAccounts(bankAccounts.length > 0 ? bankAccounts : res);
      if (bankAccounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(bankAccounts[0].id);
      } else if (res.length > 0 && !selectedAccountId) {
        setSelectedAccountId(res[0].id);
      }
    } catch (err: any) {
      console.error('Gagal mengambil daftar rekening:', err);
    }
  };

  const fetchCoa = async () => {
    try {
      const res = await api.getCoa();
      setCoaList(res);
    } catch (err: any) {
      console.error('Gagal mengambil daftar akun:', err);
    }
  };

  const loadAccountData = async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    setMsg(null);
    try {
      const [lines, books, autoRecs, sum, tpl] = await Promise.all([
        api.getBankStatementLines(selectedAccountId, { endDate: tanggalAkhir }),
        api.getBankBookEntries(selectedAccountId, tanggalAkhir),
        api.getBankAutoMatchRecommendations(selectedAccountId),
        api.getBankReconSummary(selectedAccountId, tanggalAkhir, customSaldoKoran),
        api.getBankImportTemplate(selectedAccountId).catch(() => null),
      ]);

      setStatementLines(lines);
      setBookEntries(books);
      setAutoMatches(autoRecs);
      setSummary(sum);
      setTemplate(tpl);
      if (tpl) {
        setCustomTemplate({
          ...tpl.pemetaanKolom,
          formatTanggal: tpl.formatTanggal,
          pemisahDesimal: tpl.pemisahDesimal,
          pemisahRibuan: tpl.pemisahRibuan,
          modeNominal: tpl.modeNominal,
        });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal memuat data rekonsiliasi' });
    } finally {
      setLoading(false);
    }
  };

  // Upload statement handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !selectedAccountId) {
      setMsg({ type: 'error', text: 'Pilih file dan rekening terlebih dahulu' });
      return;
    }

    setLoading(true);
    try {
      if (saveTemplateChecked) {
        await api.saveBankImportTemplate({
          cashBankAccountId: selectedAccountId,
          pemetaanKolom: {
            tanggalCol: customTemplate.tanggalCol,
            keteranganCol: customTemplate.keteranganCol,
            referensiCol: customTemplate.referensiCol,
            debitCol: customTemplate.debitCol,
            kreditCol: customTemplate.kreditCol,
            nominalCol: customTemplate.nominalCol,
            saldoCol: customTemplate.saldoCol,
            startRow: customTemplate.startRow,
          },
          formatTanggal: customTemplate.formatTanggal,
          pemisahDesimal: customTemplate.pemisahDesimal,
          pemisahRibuan: customTemplate.pemisahRibuan,
          modeNominal: customTemplate.modeNominal,
        });
      }

      const res = await api.uploadBankStatement(selectedAccountId, uploadFile, customTemplate);
      setMsg({
        type: 'success',
        text: `Impor berhasil: ${res.importedCount} baris baru dimasukkan, ${res.skippedCount} baris duplikat dilewati.`,
      });
      setIsUploadModalOpen(false);
      setUploadFile(null);
      loadAccountData();
      setCurrentStep(2);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal mengimpor rekening koran' });
    } finally {
      setLoading(false);
    }
  };

  // Batch accept all exact matches
  const handleBatchAccept = async () => {
    const exactMatches = autoMatches.filter((m) => m.matchType === 'EXACT');
    if (exactMatches.length === 0) {
      setMsg({ type: 'error', text: 'Tidak ada pencocokan otomatis berkeyakinan tinggi (Pasti).' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        matches: exactMatches.map((m) => ({
          statementLineId: m.statementLineId,
          cashBankEntryIds: m.matchedEntryIds,
        })),
      };
      const res = await api.batchAcceptBankMatches(payload);
      setMsg({ type: 'success', text: res.message });
      loadAccountData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menerima pencocokan massal' });
    } finally {
      setLoading(false);
    }
  };

  // Manual Match Execution
  const handleExecuteManualMatch = async () => {
    if (!selectedStmtLineId || selectedBookEntryIds.length === 0) {
      setMsg({ type: 'error', text: 'Pilih 1 baris rekening koran dan minimal 1 entri buku kas' });
      return;
    }

    const stmt = statementLines.find((s) => s.id === selectedStmtLineId);
    if (!stmt) return;
    const stmtAmount = Number(stmt.debit) > 0 ? Number(stmt.debit) : Number(stmt.kredit);

    // Hitung total buku terpilih
    const chosenEntries = bookEntries.filter((b) => selectedBookEntryIds.includes(b.id));
    const totalBook = chosenEntries.reduce((sum, b) => sum + Number(b.jumlah), 0);

    if (Math.abs(totalBook - stmtAmount) > 0.01) {
      setMsg({
        type: 'error',
        text: `Total entri buku (Rp ${totalBook.toLocaleString('id-ID')}) tidak sama dengan nominal rekening koran (Rp ${stmtAmount.toLocaleString('id-ID')})`,
      });
      return;
    }

    setLoading(true);
    try {
      await api.manualMatchBank({
        statementLineId: selectedStmtLineId,
        allocations: chosenEntries.map((b) => ({
          cashBankEntryId: b.id,
          jumlahAlokasi: Number(b.jumlah),
        })),
      });

      setMsg({ type: 'success', text: 'Pencocokan manual berhasil disimpan.' });
      setSelectedStmtLineId(null);
      setSelectedBookEntryIds([]);
      loadAccountData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menyimpan pencocokan manual' });
    } finally {
      setLoading(false);
    }
  };

  // Unmatch handler
  const handleUnmatch = async (stmtLineId: string) => {
    setLoading(true);
    try {
      await api.unmatchBank(stmtLineId);
      setMsg({ type: 'success', text: 'Pencocokan dibatalkan.' });
      loadAccountData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal membatalkan pencocokan' });
    } finally {
      setLoading(false);
    }
  };

  // Open adjustment modal
  const handleOpenAdjustment = (stmt: BankStatementLine) => {
    setAdjustmentStmtLine(stmt);
    setAdjustmentKeterangan(stmt.keterangan);
    setAdjustmentAkunId('');
    setIsAdjustmentModalOpen(true);
  };

  // Submit adjustment document
  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentStmtLine || !adjustmentAkunId) return;

    setLoading(true);
    try {
      await api.createBankAdjustmentDoc({
        statementLineId: adjustmentStmtLine.id,
        akunLawanId: adjustmentAkunId,
        keterangan: adjustmentKeterangan,
      });

      setMsg({ type: 'success', text: 'Dokumen penyesuaian kas berhasil dibuat dan dicocokkan otomatis.' });
      setIsAdjustmentModalOpen(false);
      loadAccountData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal membuat dokumen penyesuaian' });
    } finally {
      setLoading(false);
    }
  };

  // Ignore line submit
  const handleIgnoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ignoreStmtLineId || !ignoreReason.trim()) return;

    setLoading(true);
    try {
      await api.ignoreBankStatementLine(ignoreStmtLineId, ignoreReason.trim());
      setMsg({ type: 'success', text: 'Baris transaksi berhasil diabaikan.' });
      setIsIgnoreModalOpen(false);
      setIgnoreStmtLineId(null);
      setIgnoreReason('');
      loadAccountData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal mengabaikan baris transaksi' });
    } finally {
      setLoading(false);
    }
  };

  // Unignore
  const handleUnignore = async (stmtLineId: string) => {
    setLoading(true);
    try {
      await api.unignoreBankStatementLine(stmtLineId);
      setMsg({ type: 'success', text: 'Status abaikan dicabut.' });
      loadAccountData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal mencabut status abaikan' });
    } finally {
      setLoading(false);
    }
  };

  // Complete reconciliation handler
  const handleCompleteReconciliation = async () => {
    if (!summary || !summary.canComplete) {
      setMsg({ type: 'error', text: 'Syarat penyelesaian belum terpenuhi: selisih harus Rp 0 dan tidak ada baris UNMATCHED.' });
      return;
    }

    setLoading(true);
    try {
      const res = await api.completeBankReconciliation({
        cashBankAccountId: selectedAccountId,
        tanggalAkhir,
        saldoRekeningKoran: summary.saldoRekeningKoran,
      });

      setMsg({ type: 'success', text: res.message });
      loadAccountData();
      setCurrentStep(3);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menyelesaikan rekonsiliasi bank' });
    } finally {
      setLoading(false);
    }
  };

  // Filtered statement lines
  const filteredStatementLines = statementLines.filter((l) => {
    if (stmtFilter !== 'ALL' && l.matchStatus !== stmtFilter) return false;
    if (searchStmt.trim()) {
      const q = searchStmt.toLowerCase();
      const matchKet = (l.keterangan || '').toLowerCase().includes(q);
      const matchRef = (l.referensi || '').toLowerCase().includes(q);
      if (!matchKet && !matchRef) return false;
    }
    return true;
  });

  // Filtered book entries
  const filteredBookEntries = bookEntries.filter((b) => {
    if (searchBook.trim()) {
      const q = searchBook.toLowerCase();
      const matchKet = (b.keterangan || '').toLowerCase().includes(q);
      const matchSource = (b.sourceType || '').toLowerCase().includes(q);
      if (!matchKet && !matchSource) return false;
    }
    return true;
  });

  const exactCount = autoMatches.filter((m) => m.matchType === 'EXACT').length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-[#d4ded1] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center border border-emerald-200">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#142820]">Rekonsiliasi Bank</h1>
            <p className="text-xs text-[#556c5e]">
              Cocokkan mutasi rekening koran perbankan dengan catatan buku kas/bank
            </p>
          </div>
        </div>

        {/* Account & Cut-off Date Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#142820] mb-1">
              Rekening Kas / Bank
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-white border border-[#cbdcd0] text-[#142820] rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kode} - {a.nama} ({a.namaBank || a.jenis})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#142820] mb-1">
              Tanggal Akhir (Cut-off)
            </label>
            <input
              type="date"
              value={tanggalAkhir}
              onChange={(e) => setTanggalAkhir(e.target.value)}
              className="bg-white border border-[#cbdcd0] text-[#142820] rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-sm"
            />
          </div>

          <button
            onClick={loadAccountData}
            disabled={loading}
            className="mt-4 p-2 bg-[#edf2ea] hover:bg-[#dbe7da] text-[#142820] rounded-xl border border-[#cbdcd0] transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {onNavigateToHistory && (
            <button
              onClick={onNavigateToHistory}
              className="mt-4 px-3 py-2 bg-[#edf2ea] hover:bg-[#dbe7da] text-[#142820] rounded-xl border border-[#cbdcd0] text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
              title="Buka Riwayat Rekonsiliasi Bank"
            >
              <History className="w-3.5 h-3.5 text-emerald-700" />
              Riwayat
            </button>
          )}
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="grid grid-cols-3 gap-2 bg-white border border-[#d4ded1] rounded-2xl p-2 shadow-sm text-xs font-bold text-center">
        <button
          onClick={() => setCurrentStep(1)}
          className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
            currentStep === 1
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-[#142820] hover:bg-[#edf2ea]'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          1. Impor Rekening Koran
        </button>

        <button
          onClick={() => setCurrentStep(2)}
          className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
            currentStep === 2
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-[#142820] hover:bg-[#edf2ea]'
          }`}
        >
          <Layers className="w-4 h-4" />
          2. Pencocokan Dua Panel
          {exactCount > 0 && (
            <span className="bg-emerald-800 text-emerald-100 px-1.5 py-0.2 rounded-full text-[10px]">
              {exactCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setCurrentStep(3)}
          className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
            currentStep === 3
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-[#142820] hover:bg-[#edf2ea]'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          3. Ringkasan & Selesai
          {summary && summary.selisih === 0 && summary.unmatchedStmtCount === 0 && (
            <span className="bg-emerald-700 text-white px-1.5 py-0.2 rounded-full text-[10px]">
              Balance
            </span>
          )}
        </button>
      </div>

      {/* Alert / Notification Banner */}
      {msg && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between animate-in fade-in ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="p-1 hover:bg-black/5 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =========================================================================
          LANGKAH 1: IMPOR REKENING KORAN & WIZARD TEMPLATE
          ========================================================================= */}
      {currentStep === 1 && (
        <div className="bg-white border border-[#d4ded1] rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#e2e8df] gap-3">
            <div>
              <h2 className="text-base font-bold text-[#142820] flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Impor File Rekening Koran (CSV / Excel)
              </h2>
              <p className="text-xs text-[#556c5e] mt-0.5">
                Unggah berkas mutasi rekening koran dari internet banking BCA, Mandiri, BRI, BNI, dsb.
              </p>
            </div>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 shrink-0"
            >
              <UploadCloud className="w-4 h-4" />
              Upload Berkas Mutasi
            </button>
          </div>

          {/* Konfigurasi Template Aktif */}
          <div className="bg-[#edf2ea] border border-[#cbdcd0] rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-[#142820] flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-700" />
              Template Pemetaan Kolom untuk Rekening Ini:
            </div>
            {template ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[#142820] pt-1">
                <div>
                  <span className="text-[#556c5e]">Format Tanggal:</span> {template.formatTanggal}
                </div>
                <div>
                  <span className="text-[#556c5e]">Pemisah Angka:</span> Ribuan: '{template.pemisahRibuan}', Desimal: '{template.pemisahDesimal}'
                </div>
                <div>
                  <span className="text-[#556c5e]">Mode Nominal:</span> {template.modeNominal}
                </div>
                <div>
                  <span className="text-[#556c5e]">Baris Mulai:</span> Baris ke-{(template.pemetaanKolom?.startRow || 1) + 1}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#556c5e]">
                Belum ada template tersimpan. Klik "Upload Berkas Mutasi" untuk mengatur pemetaan kolom pertama kali.
              </p>
            )}
          </div>

          {/* Riwayat Baris Rekening Koran yang sudah terimpor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#142820]">
                Daftar Baris Rekening Koran Terdaftar ({statementLines.length} baris)
              </h3>
              <button
                onClick={() => setCurrentStep(2)}
                className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
              >
                Lanjut ke Pencocokan <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto border border-[#cbdcd0] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#eaf1e8] text-[#142e20] font-bold border-b border-[#cbdcd0]">
                  <tr>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Keterangan</th>
                    <th className="py-2.5 px-3">Referensi</th>
                    <th className="py-2.5 px-3 text-right">Debit (Keluar)</th>
                    <th className="py-2.5 px-3 text-right">Kredit (Masuk)</th>
                    <th className="py-2.5 px-3 text-right">Saldo</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8df]">
                  {statementLines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#556c5e]">
                        Belum ada mutasi rekening koran yang diimpor untuk rekening ini.
                      </td>
                    </tr>
                  ) : (
                    statementLines.slice(0, 15).map((l) => (
                      <tr key={l.id} className="hover:bg-[#f7faf6]">
                        <td className="py-2 px-3 font-mono">{new Date(l.tanggal).toLocaleDateString('id-ID')}</td>
                        <td className="py-2 px-3 font-medium text-[#142820] max-w-xs truncate">{l.keterangan}</td>
                        <td className="py-2 px-3 font-mono text-[#556c5e]">{l.referensi || '-'}</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-700">
                          {Number(l.debit) > 0 ? Number(l.debit).toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">
                          {Number(l.kredit) > 0 ? Number(l.kredit).toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">
                          {l.saldo !== null && l.saldo !== undefined ? Number(l.saldo).toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              l.matchStatus === 'MATCHED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : l.matchStatus === 'ADJUSTED'
                                ? 'bg-blue-100 text-blue-800'
                                : l.matchStatus === 'IGNORED'
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {l.matchStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {statementLines.length > 15 && (
              <p className="text-[11px] text-[#556c5e] text-center italic">
                Menampilkan 15 dari total {statementLines.length} baris mutasi rekening koran.
              </p>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          LANGKAH 2: PENCOCOKAN DUA PANEL (REKENING KORAN VS BUKU KAS)
          ========================================================================= */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Action Toolbar: Auto-Match & Batch Accept */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#d4ded1] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#142820]">Saran Pencocokan Otomatis:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                {exactCount} Pasti (Exact)
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                {autoMatches.filter((m) => m.matchType === 'SUGGESTED' || m.matchType === 'GROUP_SUGGESTED').length} Disarankan
              </span>
            </div>

            <div className="flex items-center gap-2">
              {exactCount > 0 && (
                <button
                  onClick={handleBatchAccept}
                  disabled={loading}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Terima Semua Pencocokan Pasti ({exactCount})
                </button>
              )}

              {selectedStmtLineId && selectedBookEntryIds.length > 0 && (
                <button
                  onClick={handleExecuteManualMatch}
                  disabled={loading}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Simpan Pencocokan Terpilih
                </button>
              )}
            </div>
          </div>

          {/* DUA PANEL UTAMA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* PANEL KIRI: MUTASI REKENING KORAN */}
            <div className="bg-white border border-[#d4ded1] rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#e2e8df]">
                <div className="font-bold text-xs text-[#142820] flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-emerald-600" />
                  Panel Rekening Koran (Bank Statement)
                </div>
                <div className="flex items-center gap-1.5">
                  <select
                    value={stmtFilter}
                    onChange={(e: any) => setStmtFilter(e.target.value)}
                    className="text-[11px] bg-[#edf2ea] border border-[#cbdcd0] rounded-lg px-2 py-1 font-semibold text-[#142820]"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="UNMATCHED">UNMATCHED (Belum Cocok)</option>
                    <option value="MATCHED">MATCHED (Cocok)</option>
                    <option value="ADJUSTED">ADJUSTED (Penyesuaian)</option>
                    <option value="IGNORED">IGNORED (Diabaikan)</option>
                  </select>
                </div>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari transaksi bank..."
                  value={searchStmt}
                  onChange={(e) => setSearchStmt(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#cbdcd0] rounded-xl text-xs text-[#142820] outline-none"
                />
              </div>

              {/* List Baris Mutasi */}
              <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
                {filteredStatementLines.length === 0 ? (
                  <p className="text-center py-8 text-xs text-[#556c5e]">
                    Tidak ada transaksi rekening koran yang sesuai filter.
                  </p>
                ) : (
                  filteredStatementLines.map((stmt) => {
                    const isDebit = Number(stmt.debit) > 0;
                    const amount = isDebit ? Number(stmt.debit) : Number(stmt.kredit);
                    const isSelected = selectedStmtLineId === stmt.id;
                    const rec = autoMatches.find((m) => m.statementLineId === stmt.id);

                    return (
                      <div
                        key={stmt.id}
                        className={`p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-200'
                            : stmt.matchStatus === 'MATCHED'
                            ? 'border-emerald-200 bg-emerald-50/20'
                            : stmt.matchStatus === 'ADJUSTED'
                            ? 'border-blue-200 bg-blue-50/20'
                            : stmt.matchStatus === 'IGNORED'
                            ? 'border-slate-200 bg-slate-50 opacity-60'
                            : 'border-[#cbdcd0] bg-white hover:border-emerald-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="selectedStmtRadio"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedStmtLineId(stmt.id);
                                if (rec && rec.matchedEntryIds.length > 0) {
                                  setSelectedBookEntryIds(rec.matchedEntryIds);
                                }
                              }}
                              disabled={stmt.matchStatus !== 'UNMATCHED'}
                              className="rounded-full text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-mono font-bold text-[#142820]">
                              {new Date(stmt.tanggal).toLocaleDateString('id-ID')}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                isDebit ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isDebit ? 'DEBIT (Keluar)' : 'KREDIT (Masuk)'}
                            </span>
                          </div>

                          <span className="font-mono font-bold text-sm text-[#142820]">
                            Rp {amount.toLocaleString('id-ID')}
                          </span>
                        </div>

                        <p className="text-[#142820] font-medium leading-relaxed">{stmt.keterangan}</p>
                        {stmt.referensi && (
                          <p className="text-[11px] text-[#556c5e] font-mono">Ref: {stmt.referensi}</p>
                        )}

                        {/* Rekomendasi Auto-Match Badge */}
                        {rec && rec.matchType !== 'NONE' && stmt.matchStatus === 'UNMATCHED' && (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                            <span>
                              {rec.matchType === 'EXACT'
                                ? 'Pencocokan Pasti (100% Cocok)'
                                : rec.matchType === 'GROUP_SUGGESTED'
                                ? 'Saran Gabungan (Group)'
                                : 'Saran Pencocokan'}
                            </span>
                            <span className="text-[10px] text-emerald-600 font-mono">
                              ({rec.confidenceScore}%)
                            </span>
                          </div>
                        )}

                        {/* Actions Bar per Baris */}
                        <div className="flex items-center justify-between pt-1 border-t border-[#e2e8df] text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              stmt.matchStatus === 'MATCHED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : stmt.matchStatus === 'ADJUSTED'
                                ? 'bg-blue-100 text-blue-800'
                                : stmt.matchStatus === 'IGNORED'
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {stmt.matchStatus}
                          </span>

                          <div className="flex items-center gap-2">
                            {stmt.matchStatus === 'UNMATCHED' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenAdjustment(stmt)}
                                  className="text-blue-700 hover:underline font-semibold flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" /> Buat Dokumen Kas
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIgnoreStmtLineId(stmt.id);
                                    setIsIgnoreModalOpen(true);
                                  }}
                                  className="text-slate-500 hover:text-slate-800 font-semibold"
                                >
                                  Abaikan
                                </button>
                              </>
                            )}

                            {(stmt.matchStatus === 'MATCHED' || stmt.matchStatus === 'ADJUSTED') && (
                              <button
                                type="button"
                                onClick={() => handleUnmatch(stmt.id)}
                                className="text-rose-600 hover:underline font-semibold flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3" /> Batal Cocok
                              </button>
                            )}

                            {stmt.matchStatus === 'IGNORED' && (
                              <button
                                type="button"
                                onClick={() => handleUnignore(stmt.id)}
                                className="text-emerald-700 hover:underline font-semibold"
                              >
                                Pulihkan
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* PANEL KANAN: BUKU KAS / BANK (LEDGER ENTRIES) */}
            <div className="bg-white border border-[#d4ded1] rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#e2e8df]">
                <div className="font-bold text-xs text-[#142820] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  Panel Buku Kas / Bank (Catatan Internal)
                </div>
                <span className="text-[11px] text-[#556c5e] font-semibold">
                  {bookEntries.length} entri buku s.d {tanggalAkhir}
                </span>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari transaksi buku kas..."
                  value={searchBook}
                  onChange={(e) => setSearchBook(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#cbdcd0] rounded-xl text-xs text-[#142820] outline-none"
                />
              </div>

              {/* List Entri Buku */}
              <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
                {filteredBookEntries.length === 0 ? (
                  <p className="text-center py-8 text-xs text-[#556c5e]">
                    Tidak ada entri buku kas yang belum cleared pada rekening ini.
                  </p>
                ) : (
                  filteredBookEntries.map((book) => {
                    const isMasuk = book.arah === 'MASUK';
                    const isChecked = selectedBookEntryIds.includes(book.id);

                    return (
                      <div
                        key={book.id}
                        className={`p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                          isChecked
                            ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-200'
                            : 'border-[#cbdcd0] bg-white hover:border-emerald-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedBookEntryIds([...selectedBookEntryIds, book.id]);
                                } else {
                                  setSelectedBookEntryIds(
                                    selectedBookEntryIds.filter((id) => id !== book.id),
                                  );
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-mono font-bold text-[#142820]">
                              {new Date(book.tanggal).toLocaleDateString('id-ID')}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                isMasuk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {book.arah}
                            </span>
                          </div>

                          <span className="font-mono font-bold text-sm text-[#142820]">
                            Rp {Number(book.jumlah).toLocaleString('id-ID')}
                          </span>
                        </div>

                        <p className="text-[#142820] font-medium leading-relaxed">{book.keterangan}</p>
                        <div className="flex items-center justify-between text-[11px] text-[#556c5e]">
                          <span className="font-mono">Modul: {book.sourceType}</span>
                          {book.clearedAt && (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Cleared
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          LANGKAH 3: RINGKASAN REKONSILIASI & SELESAI
          ========================================================================= */}
      {currentStep === 3 && summary && (
        <div className="bg-white border border-[#d4ded1] rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b border-[#e2e8df] pb-4">
            <h2 className="text-base font-bold text-[#142820] flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-600" />
              Ringkasan Rekonsiliasi Bank per {new Date(tanggalAkhir).toLocaleDateString('id-ID')}
            </h2>
            <p className="text-xs text-[#556c5e] mt-0.5">
              Rumus: Saldo Bank Disesuaikan = Saldo Rekening Koran + Setoran Dalam Perjalanan − Cek/Transfer Belum Cair
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Saldo Rekening Koran */}
            <div className="bg-[#edf2ea] border border-[#cbdcd0] rounded-xl p-4">
              <span className="text-[11px] font-bold text-[#556c5e]">1. Saldo Rekening Koran</span>
              <div className="text-lg font-bold font-mono text-[#142820] mt-1">
                Rp {summary.saldoRekeningKoran.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-[#556c5e] mt-1">Sesuai rekening koran per cut-off</p>
            </div>

            {/* Setoran Dalam Perjalanan */}
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4">
              <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5" /> 2. Setoran Dalam Perjalanan
              </span>
              <div className="text-lg font-bold font-mono text-emerald-900 mt-1">
                + Rp {summary.itemBeredar.setoranDalamPerjalanan.total.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-emerald-700 mt-1">
                {summary.itemBeredar.setoranDalamPerjalanan.items.length} transaksi belum masuk bank
              </p>
            </div>

            {/* Cek / Transfer Belum Dicairkan */}
            <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4">
              <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> 3. Cek Belum Dicairkan
              </span>
              <div className="text-lg font-bold font-mono text-rose-900 mt-1">
                − Rp {summary.itemBeredar.cekBelumCair.total.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-rose-700 mt-1">
                {summary.itemBeredar.cekBelumCair.items.length} transaksi belum dicairkan vendor
              </p>
            </div>

            {/* Saldo Bank Disesuaikan */}
            <div className="bg-[#eaf1e8] border border-[#cbdcd0] rounded-xl p-4">
              <span className="text-[11px] font-bold text-[#142e20]">4. Saldo Bank Disesuaikan</span>
              <div className="text-lg font-bold font-mono text-emerald-900 mt-1">
                Rp {summary.saldoBankDisesuaikan.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-emerald-800 mt-1">Hasil rekonsiliasi akhir</p>
            </div>
          </div>

          {/* Kotak Banding Saldo Buku vs Selisih */}
          <div className="bg-[#edf2ea] border border-[#cbdcd0] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#cbdcd0] pb-3 gap-2">
              <span className="text-sm font-bold text-[#142820]">Saldo Buku Kas / Bank Internal:</span>
              <span className="font-mono text-xl font-bold text-[#142820]">
                Rp {summary.saldoBuku.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-1">
                <span className="text-sm font-bold text-[#142820] flex items-center gap-2">
                  Status Keseimbangan (Selisih):
                  {summary.selisih === 0 && summary.unmatchedStmtCount === 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white">
                      SEIMBANG (Rp 0)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white">
                      BELUM REKONSILIASI
                    </span>
                  )}
                </span>
                {summary.unmatchedStmtCount > 0 && (
                  <p className="text-xs text-rose-700 font-semibold">
                    Masih terdapat {summary.unmatchedStmtCount} baris rekening koran UNMATCHED.
                  </p>
                )}
              </div>

              <div className="text-right">
                <span className="text-xs text-[#556c5e] block">Selisih Akhir:</span>
                <span
                  className={`font-mono text-2xl font-bold ${
                    summary.selisih === 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  Rp {Math.abs(summary.selisih).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>

          {/* Tombol Aksi Selesai */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleCompleteReconciliation}
              disabled={!summary.canComplete || loading}
              className={`px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-md flex items-center gap-2 ${
                summary.canComplete
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-[1.02]'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              Selesaikan Rekonsiliasi Bank
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: UPLOAD FILE & WIZARD PEMETAAN KOLOM
          ========================================================================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-[#d4ded1] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2e8df] pb-3">
              <h3 className="font-bold text-base text-[#142820] flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-emerald-600" />
                Upload Rekening Koran & Pemetaan Kolom
              </h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              {/* File Input */}
              <div>
                <label className="block font-semibold text-[#142820] mb-1">
                  Pilih File Rekening Koran (CSV / XLSX / XLS) *
                </label>
                <input
                  type="file"
                  required
                  accept=".csv, .xlsx, .xls"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 border border-[#cbdcd0] rounded-xl p-2 bg-white"
                />
              </div>

              {/* Mode Nominal */}
              <div>
                <label className="block font-semibold text-[#142820] mb-1">Mode Nominal Mutasi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCustomTemplate({ ...customTemplate, modeNominal: 'DEBIT_KREDIT_TERPISAH' })
                    }
                    className={`py-1.5 px-3 rounded-lg border font-semibold ${
                      customTemplate.modeNominal === 'DEBIT_KREDIT_TERPISAH'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-[#edf2ea] text-[#142820] border-[#cbdcd0]'
                    }`}
                  >
                    Debit & Kredit Terpisah
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCustomTemplate({ ...customTemplate, modeNominal: 'SATU_KOLOM_BERTANDA' })
                    }
                    className={`py-1.5 px-3 rounded-lg border font-semibold ${
                      customTemplate.modeNominal === 'SATU_KOLOM_BERTANDA'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-[#edf2ea] text-[#142820] border-[#cbdcd0]'
                    }`}
                  >
                    1 Kolom (Bertanda +/-)
                  </button>
                </div>
              </div>

              {/* Indeks Kolom (0-indexed) */}
              <div className="grid grid-cols-2 gap-3 bg-[#edf2ea] p-3 rounded-xl border border-[#cbdcd0]">
                <div>
                  <label className="block font-semibold text-[#142820] mb-0.5">Kolom Tanggal (Index)</label>
                  <input
                    type="number"
                    min="0"
                    value={customTemplate.tanggalCol}
                    onChange={(e) =>
                      setCustomTemplate({ ...customTemplate, tanggalCol: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#142820] mb-0.5">Kolom Keterangan</label>
                  <input
                    type="number"
                    min="0"
                    value={customTemplate.keteranganCol}
                    onChange={(e) =>
                      setCustomTemplate({ ...customTemplate, keteranganCol: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1"
                  />
                </div>

                {customTemplate.modeNominal === 'DEBIT_KREDIT_TERPISAH' ? (
                  <>
                    <div>
                      <label className="block font-semibold text-[#142820] mb-0.5">Kolom Debit (Keluar)</label>
                      <input
                        type="number"
                        min="0"
                        value={customTemplate.debitCol}
                        onChange={(e) =>
                          setCustomTemplate({ ...customTemplate, debitCol: parseInt(e.target.value) || 0 })
                        }
                        className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#142820] mb-0.5">Kolom Kredit (Masuk)</label>
                      <input
                        type="number"
                        min="0"
                        value={customTemplate.kreditCol}
                        onChange={(e) =>
                          setCustomTemplate({ ...customTemplate, kreditCol: parseInt(e.target.value) || 0 })
                        }
                        className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block font-semibold text-[#142820] mb-0.5">Kolom Nominal</label>
                    <input
                      type="number"
                      min="0"
                      value={customTemplate.nominalCol}
                      onChange={(e) =>
                        setCustomTemplate({ ...customTemplate, nominalCol: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-[#142820] mb-0.5">Baris Mulai Data (Row)</label>
                  <input
                    type="number"
                    min="1"
                    value={customTemplate.startRow}
                    onChange={(e) =>
                      setCustomTemplate({ ...customTemplate, startRow: parseInt(e.target.value) || 1 })
                    }
                    className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#142820] mb-0.5">Kolom Saldo (Opsional)</label>
                  <input
                    type="number"
                    min="0"
                    value={customTemplate.saldoCol}
                    onChange={(e) =>
                      setCustomTemplate({ ...customTemplate, saldoCol: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1"
                  />
                </div>
              </div>

              {/* Format Format Tanggal & Angka */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#142820] mb-0.5">Pemisah Desimal</label>
                  <input
                    type="text"
                    value={customTemplate.pemisahDesimal}
                    onChange={(e) =>
                      setCustomTemplate({ ...customTemplate, pemisahDesimal: e.target.value })
                    }
                    className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#142820] mb-0.5">Pemisah Ribuan</label>
                  <input
                    type="text"
                    value={customTemplate.pemisahRibuan}
                    onChange={(e) =>
                      setCustomTemplate({ ...customTemplate, pemisahRibuan: e.target.value })
                    }
                    className="w-full bg-white border border-[#cbdcd0] rounded-lg px-2 py-1 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="saveTplCheck"
                  checked={saveTemplateChecked}
                  onChange={(e) => setSaveTemplateChecked(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="saveTplCheck" className="text-xs text-[#142820] font-semibold">
                  Simpan konfigurasi ini sebagai template default rekening ini
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#e2e8df]">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 bg-[#edf2ea] text-[#142820] rounded-xl font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading || !uploadFile}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm"
                >
                  {loading ? 'Mengimpor...' : 'Mulai Impor File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: PENYESUAIAN KAS (BUAT DOKUMEN PENYESUAIAN DARI MUTASI BANK)
          ========================================================================= */}
      {isAdjustmentModalOpen && adjustmentStmtLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-[#d4ded1] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2e8df] pb-3">
              <h3 className="font-bold text-base text-[#142820] flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Buat Dokumen Penyesuaian Kas
              </h3>
              <button onClick={() => setIsAdjustmentModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="space-y-4 text-xs">
              <div className="bg-[#edf2ea] p-3 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between font-mono font-bold">
                  <span>Tanggal: {new Date(adjustmentStmtLine.tanggal).toLocaleDateString('id-ID')}</span>
                  <span className={Number(adjustmentStmtLine.debit) > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                    Rp{' '}
                    {(
                      Number(adjustmentStmtLine.debit) > 0
                        ? Number(adjustmentStmtLine.debit)
                        : Number(adjustmentStmtLine.kredit)
                    ).toLocaleString('id-ID')}
                  </span>
                </div>
                <p className="text-[#142820] italic">{adjustmentStmtLine.keterangan}</p>
              </div>

              <div>
                <label className="block font-semibold text-[#142820] mb-1">
                  Pilih Akun Lawan (Chart of Accounts) *
                </label>
                <select
                  required
                  value={adjustmentAkunId}
                  onChange={(e) => setAdjustmentAkunId(e.target.value)}
                  className="w-full bg-white border border-[#cbdcd0] rounded-xl px-3 py-2 text-xs text-[#142820]"
                >
                  <option value="">-- Pilih Akun Lawan --</option>
                  {coaList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.kode_akun} - {c.nama_akun} ({c.kategori})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#556c5e] mt-1">
                  Contoh: Akun Beban Administrasi Bank, Pendapatan Bunga, atau Pajak Bunga Bank.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-[#142820] mb-1">Catatan / Deskripsi</label>
                <input
                  type="text"
                  value={adjustmentKeterangan}
                  onChange={(e) => setAdjustmentKeterangan(e.target.value)}
                  className="w-full bg-white border border-[#cbdcd0] rounded-xl px-3 py-2 text-xs text-[#142820]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#e2e8df]">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="px-4 py-2 bg-[#edf2ea] text-[#142820] rounded-xl font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading || !adjustmentAkunId}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm"
                >
                  {loading ? 'Memproses...' : 'Posting & Cocokkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ABAIKAN BARIS (IGNORE DENGAN ALASAN)
          ========================================================================= */}
      {isIgnoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-[#d4ded1] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2e8df] pb-3">
              <h3 className="font-bold text-sm text-[#142820] flex items-center gap-2">
                <Ban className="w-4 h-4 text-slate-600" />
                Abaikan Baris Transaksi
              </h3>
              <button onClick={() => setIsIgnoreModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleIgnoreSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#142820] mb-1">
                  Alasan Pengabaian Transaksi *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Contoh: Transaksi salah transfer yang langsung dibatalkan bank, setoran dana non-perusahaan, dll."
                  value={ignoreReason}
                  onChange={(e) => setIgnoreReason(e.target.value)}
                  className="w-full bg-white border border-[#cbdcd0] rounded-xl p-2 text-xs text-[#142820]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#e2e8df]">
                <button
                  type="button"
                  onClick={() => setIsIgnoreModalOpen(false)}
                  className="px-3 py-1.5 bg-[#edf2ea] text-[#142820] rounded-xl font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading || !ignoreReason.trim()}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold shadow-sm"
                >
                  Simpan Abaikan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

