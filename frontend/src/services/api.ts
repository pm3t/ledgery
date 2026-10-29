// Client API Service untuk berkomunikasi dengan Backend NestJS Ledgery
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '/api' : 'http://localhost:3001');

export interface Tenant {
  id: string;
  nama_perusahaan: string;
  tahun_buku_mulai: number;
  mata_uang: string;
  status_langganan: 'ACTIVE' | 'INACTIVE' | 'TRIAL';
  billingStatus?: 'PAID' | 'UNPAID' | 'OVERDUE';
  billingDueDate?: string;
  createdAt: string;
  updatedAt: string;
  postingPolicy?: {
    mode: 'AUTO_POST' | 'APPROVAL_MANUAL';
  };
  _count?: {
    chartOfAccounts: number;
    apiKeys: number;
  };
}

export interface ChartOfAccount {
  id: string;
  tenantId: string;
  kode_akun: string;
  nama_akun: string;
  kategori: 'ASET' | 'LIABILITAS' | 'EKUITAS' | 'PENDAPATAN' | 'BEBAN';
  parentId?: string | null;
  isActive: boolean;
  isControlAccount?: boolean;
  createdAt: string;
  updatedAt: string;
  parent?: {
    id: string;
    kode_akun: string;
    nama_akun: string;
  } | null;
}

export interface ApiKeyItem {
  id: string;
  tenantId: string;
  nama_label: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface GeneratedApiKeyResponse extends ApiKeyItem {
  rawApiKey: string;
}

export interface PostingPolicySetting {
  id: string;
  tenantId: string;
  mode: 'AUTO_POST' | 'APPROVAL_MANUAL';
  updatedBy: string;
  updatedAt: string;
}

export interface JournalEntryDimensionItem {
  id: string;
  dimensionId: string;
  dimensionValueId: string;
  dimensionValue?: {
    id: string;
    kode: string;
    nama: string;
    dimension?: {
      id: string;
      nama_dimension: string;
    };
  };
}

export interface JournalEntryItem {
  id: string;
  chartOfAccountId: string;
  tipe: 'DEBIT' | 'KREDIT';
  jumlah: number;
  jumlah_asli?: number | null;
  jumlah_konversi?: number | null;
  chartOfAccount?: {
    kode_akun: string;
    nama_akun: string;
    kategori?: string;
  };
  dimensions?: JournalEntryDimensionItem[];
}

export interface Journal {
  id: string;
  tenantId: string;
  no_voucher: string;
  tanggal: string;
  deskripsi: string;
  sumber_aplikasi: string;
  status: 'POSTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  idempotency_key?: string | null;
  mata_uang?: string;
  createdAt: string;
  entries: JournalEntryItem[];
}

export interface LedgerLine {
  id: string;
  tanggal: string;
  no_voucher: string;
  deskripsi: string;
  sumber_aplikasi: string;
  debit: number;
  kredit: number;
  saldo_berjalan: number;
  dimensions?: {
    dimensionName?: string;
    valueName?: string;
    valueCode?: string;
  }[];
}

export interface LedgerResponse {
  akun: ChartOfAccount;
  normalBalance: 'DEBIT' | 'KREDIT';
  totalMutasi: number;
  totalDebit?: number;
  totalKredit?: number;
  saldoAkhir: number;
  mutasi: LedgerLine[];
}

export interface ApprovalLog {
  id: string;
  journalId: string;
  action: 'APPROVED' | 'REJECTED';
  alasan: string | null;
  actorUserId: string;
  createdAt: string;
  journal: {
    no_voucher: string;
    tanggal: string;
    deskripsi: string;
  };
}

export interface AppNotification {
  id: string;
  tenantId: string;
  judul: string;
  pesan: string;
  isRead: boolean;
  createdAt: string;
}

export interface ReportCoaItem {
  coa: ChartOfAccount;
  debit: number;
  kredit: number;
  saldo: number;
}

export interface TrialBalanceReport {
  items: ReportCoaItem[];
  totalDebit: number;
  totalKredit: number;
  isBalanced: boolean;
}

export interface BalanceSheetReport {
  aset: ReportCoaItem[];
  liabilitas: ReportCoaItem[];
  ekuitas: ReportCoaItem[];
  labaBersihBerjalan: number;
  totalAset: number;
  totalLiabilitas: number;
  totalEkuitas: number;
  totalPasiva: number;
  isBalanced: boolean;
}

export interface IncomeStatementReport {
  main: {
    pendapatan: ReportCoaItem[];
    beban: ReportCoaItem[];
    totalPendapatan: number;
    totalBeban: number;
    labaBersih: number;
  };
  comparison: {
    pendapatan: ReportCoaItem[];
    beban: ReportCoaItem[];
    totalPendapatan: number;
    totalBeban: number;
    labaBersih: number;
  } | null;
  hasComparison: boolean;
}

export interface CashFlowReport {
  labaBersih: number;
  aktivitasOperasi: {
    penyesuaian: { akun: string; nilai: number; keterangan: string }[];
    netKas: number;
  };
  aktivitasInvestasi: { netKas: number };
  aktivitasPendanaan: { netKas: number };
  netKenaikanKas: number;
}

export interface DimensionAnalysisColumn {
  id: string;
  kode: string;
  nama: string;
}

export interface DimensionAnalysisRow {
  coa: {
    id: string;
    kode_akun: string;
    nama_akun: string;
    kategori: string;
    isControlAccount?: boolean;
  };
  values: Record<string, number>;
  total: number;
}

export interface DimensionAnalysisReport {
  dimension: {
    id: string;
    nama_dimension: string;
  };
  columns: DimensionAnalysisColumn[];
  hasUnassigned: boolean;
  rows: DimensionAnalysisRow[];
  columnTotals: Record<string, number>;
  grandTotal: number;
}

// --- TAX MODELS ---
export interface TaxSetting {
  id: string;
  tenantId: string;
  tarif_ppn: number;
  npwp: string | null;
  aktifkan_pph21: boolean;
}

export interface TaxRecap {
  id: string;
  tenantId: string;
  jenis_pajak: 'PPN' | 'PPH21';
  periode: string;
  total_dasar_pengenaan: number;
  total_pajak: number;
  createdAt: string;
}

// --- ADMIN MODELS ---
export interface ConnectedApp {
  namaAplikasi: string;
  jumlahJurnal: number;
  terakhirKirim: string;
}

export interface AuditLog {
  id: string;
  actorRole: string;
  action: string;
  targetTenantId: string;
  deskripsi: string;
  createdAt: string;
}

// --- DIMENSION MODELS (V2 Delta) ---
export interface DimensionValue {
  id: string;
  dimensionId: string;
  kode: string;
  nama: string;
  isActive: boolean;
}

export interface Dimension {
  id: string;
  tenantId: string;
  nama_dimension: string;
  isActive: boolean;
  createdAt: string;
  values: DimensionValue[];
}

// --- CURRENCY & EXCHANGE RATE (V2 Delta) ---
export interface Currency {
  id: string;
  kode_iso: string;
  nama: string;
  isActive: boolean;
}

export interface ExchangeRate {
  id: string;
  tenantId: string;
  currencyId: string;
  tanggal: string;
  kurs: number;
  createdBy?: string;
  createdAt: string;
  currency: Currency;
}

// --- LOGGING MODELS ---
export interface IntegrationLog {
  id: string;
  tenantId: string;
  apiKeyId: string | null;
  endpoint: string;
  versi_api: string;
  statusCode: number;
  payload_ringkas: string;
  createdAt: string;
}

// Helper fetch bawaan dengan penanganan error terpusat
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...options.headers,
  });

  // Sematkan JWT access token ke header Authorization jika tersedia
  const token = localStorage.getItem('access_token');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Fallback backward compat untuk Super Admin mock (akan dihapus setelah auth penuh)
  const role = localStorage.getItem('app_role');
  if (role === 'SUPER_ADMIN' && !token) {
    headers.set('X-User-Role', 'SUPER_ADMIN');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = Array.isArray(data.message)
      ? data.message.join(', ')
      : data.message || 'Terjadi kesalahan pada server';
    throw new Error(errorMsg);
  }

  return data.data !== undefined ? data.data : data;
}

export const api = {
  // --- TENANT API ---
  getTenants: () => request<Tenant[]>('/tenants'),
  getTenant: (id: string) => request<Tenant>(`/tenants/${id}`),
  createTenant: (payload: { nama_perusahaan: string; tahun_buku_mulai?: number; mata_uang?: string }) =>
    request<Tenant>('/tenants', { method: 'POST', body: JSON.stringify(payload) }),

  // --- CHART OF ACCOUNTS API ---
  getCoaByTenant: (tenantId: string, kategori?: string, search?: string) => {
    const params = new URLSearchParams();
    if (kategori && kategori !== 'ALL') params.append('kategori', kategori);
    if (search) params.append('search', search);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<ChartOfAccount[]>(`/chart-of-accounts/tenant/${tenantId}${queryString}`);
  },
  createCoa: (payload: {
    tenantId: string;
    kode_akun: string;
    nama_akun: string;
    kategori: string;
    parentId?: string | null;
    isActive?: boolean;
    isControlAccount?: boolean;
  }) => request<ChartOfAccount>('/chart-of-accounts', { method: 'POST', body: JSON.stringify(payload) }),

  updateCoa: (id: string, payload: Partial<{ kode_akun: string; nama_akun: string; kategori: string; parentId: string | null; isActive: boolean; isControlAccount: boolean }>) =>
    request<ChartOfAccount>(`/chart-of-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  deleteCoa: (id: string) => request<void>(`/chart-of-accounts/${id}`, { method: 'DELETE' }),

  // --- API KEY MANAGEMENT API ---
  getApiKeysByTenant: (tenantId: string) => request<ApiKeyItem[]>(`/api-keys/tenant/${tenantId}`),
  generateApiKey: (payload: { tenantId: string; nama_label: string }) =>
    request<GeneratedApiKeyResponse>('/api-keys/generate', { method: 'POST', body: JSON.stringify(payload) }),
  revokeApiKey: (id: string) => request<ApiKeyItem>(`/api-keys/${id}/revoke`, { method: 'PATCH' }),
  deleteApiKey: (id: string) => request<void>(`/api-keys/${id}`, { method: 'DELETE' }),

  // --- SETTINGS (POSTING POLICY) API ---
  getPostingPolicy: (tenantId: string) => request<PostingPolicySetting>(`/settings/posting-policy/${tenantId}`),
  updatePostingPolicy: (tenantId: string, mode: 'AUTO_POST' | 'APPROVAL_MANUAL', updatedBy?: string) =>
    request<PostingPolicySetting>(`/settings/posting-policy/${tenantId}`, {
      method: 'PUT',
      body: JSON.stringify({ mode, updatedBy }),
    }),

  // --- JOURNAL API ---
  getJournalsByTenant: (tenantId: string, params?: { status?: string; sumber?: string; startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.sumber) query.append('sumber', params.sumber);
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<Journal[]>(`/journals/tenant/${tenantId}${qs}`);
  },
  getJournalDetail: (tenantId: string, id: string) => {
    return request<Journal>(`/journals/${id}?tenantId=${tenantId}`);
  },
  createManualJournal: (payload: {
    tenantId: string;
    tanggal: string;
    deskripsi: string;
    sumber_aplikasi: string;
    mata_uang?: string;
    entries: {
      kode_akun: string;
      tipe: 'DEBIT' | 'KREDIT';
      jumlah: number;
      dimensions?: { nama_dimension: string; kode_value: string }[];
    }[];
  }) => request<Journal>('/journals/manual', { method: 'POST', body: JSON.stringify(payload) }),
  reverseJournal: (journalId: string, payload: { tenantId: string; tanggal?: string; alasan?: string }) =>
    request<Journal>(`/journals/${journalId}/reverse`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // --- GENERAL LEDGER API ---
  getAccountLedger: (
    tenantId: string,
    accountId: string,
    startDate?: string,
    endDate?: string,
    dimensionValues?: string,
    deskripsi?: string,
  ) => {
    const query = new URLSearchParams();
    if (startDate) query.append('startDate', startDate);
    if (endDate) query.append('endDate', endDate);
    if (dimensionValues) query.append('dimensionValues', dimensionValues);
    if (deskripsi) query.append('deskripsi', deskripsi);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<LedgerResponse>(`/ledger/tenant/${tenantId}/account/${accountId}${qs}`);
  },

  // --- JOURNAL APPROVAL API ---
  getPendingJournals: (tenantId: string) => request<Journal[]>(`/internal/journals/pending/${tenantId}`),
  approveJournal: (journalId: string, tenantId: string) => 
    request<Journal>(`/internal/journals/${journalId}/approve`, { method: 'POST', body: JSON.stringify({ tenantId }) }),
  rejectJournal: (journalId: string, tenantId: string, alasan: string) => 
    request<Journal>(`/internal/journals/${journalId}/reject`, { method: 'POST', body: JSON.stringify({ tenantId, alasan }) }),
  getApprovalHistory: (tenantId: string) => request<ApprovalLog[]>(`/internal/journals/approval-history/${tenantId}`),

  // --- NOTIFICATION API ---
  getNotifications: (tenantId: string, unreadOnly: boolean = false) => 
    request<AppNotification[]>(`/notifications/tenant/${tenantId}?unreadOnly=${unreadOnly}`),
  markNotificationAsRead: (id: string) => request<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsAsRead: (tenantId: string) => request<void>(`/notifications/tenant/${tenantId}/read-all`, { method: 'PATCH' }),

  // --- FINANCIAL REPORTS API ---
  getTrialBalance: (tenantId: string, startDate?: string, endDate?: string, dimensionValues?: string) => {
    const q = new URLSearchParams();
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    if (dimensionValues) q.append('dimensionValues', dimensionValues);
    return request<TrialBalanceReport>(`/reports/trial-balance/${tenantId}?${q.toString()}`);
  },
  getBalanceSheet: (tenantId: string, date?: string) => {
    const q = new URLSearchParams();
    if (date) q.append('date', date);
    return request<BalanceSheetReport>(`/reports/balance-sheet/${tenantId}?${q.toString()}`);
  },
  getIncomeStatement: (tenantId: string, startDate?: string, endDate?: string, compStart?: string, compEnd?: string) => {
    const q = new URLSearchParams();
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    if (compStart) q.append('compareStartDate', compStart);
    if (compEnd) q.append('compareEndDate', compEnd);
    return request<IncomeStatementReport>(`/reports/income-statement/${tenantId}?${q.toString()}`);
  },
  getCashFlow: (tenantId: string, startDate: string, endDate: string) => {
    const q = new URLSearchParams({ startDate, endDate });
    return request<CashFlowReport>(`/reports/cash-flow/${tenantId}?${q.toString()}`);
  },
  getIncomeStatementByDimension: (tenantId: string, dimensionId: string, startDate?: string, endDate?: string) => {
    const q = new URLSearchParams({ dimensionId });
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    return request<any[]>(`/reports/laba-rugi-by-dimension/${tenantId}?${q.toString()}`);
  },
  getDimensionAnalysis: (
    tenantId: string,
    params: {
      dimensionId: string;
      tipeSaldo?: 'AS_OF' | 'MUTASI';
      startDate?: string;
      endDate?: string;
      kategori?: string;
    },
  ) => {
    const q = new URLSearchParams({ dimensionId: params.dimensionId });
    if (params.tipeSaldo) q.append('tipeSaldo', params.tipeSaldo);
    if (params.startDate) q.append('startDate', params.startDate);
    if (params.endDate) q.append('endDate', params.endDate);
    if (params.kategori) q.append('kategori', params.kategori);
    return request<DimensionAnalysisReport>(`/reports/dimension-analysis/${tenantId}?${q.toString()}`);
  },

  // --- TAX API ---
  getTaxSetting: (tenantId: string) => request<TaxSetting>(`/tax/setting/${tenantId}`),
  updateTaxSetting: (tenantId: string, data: { tarif_ppn: number; npwp: string | null; aktifkan_pph21: boolean }) => 
    request<TaxSetting>(`/tax/setting/${tenantId}`, { method: 'PUT', body: JSON.stringify(data) }),
  calculatePpn: (tenantId: string, periode: string) => 
    request<TaxRecap>(`/tax/calculate-ppn`, { method: 'POST', body: JSON.stringify({ tenantId, periode }) }),
  calculatePph21: (tenantId: string, periode: string) => 
    request<TaxRecap>(`/tax/calculate-pph21`, { method: 'POST', body: JSON.stringify({ tenantId, periode }) }),
  getTaxRecaps: (tenantId: string, jenis?: 'PPN' | 'PPH21', periode?: string) => {
    const q = new URLSearchParams();
    if (jenis) q.append('jenis', jenis);
    if (periode) q.append('periode', periode);
    return request<TaxRecap[]>(`/tax/recap/${tenantId}?${q.toString()}`);
  },

  // --- SUPER ADMIN API ---
  adminGetTenants: () => request<Tenant[]>(`/admin/tenants`),
  adminOnboardTenant: (data: { nama_perusahaan: string; tahun_buku_mulai: number; mata_uang: string }) =>
    request<Tenant>(`/admin/tenants/onboard`, { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateBilling: (tenantId: string, status: string, extendedDays?: number) =>
    request(`/admin/tenants/${tenantId}/billing`, { method: 'PUT', body: JSON.stringify({ status, extendedDays }) }),
  adminGetConnectedApps: (tenantId: string) => request<ConnectedApp[]>(`/admin/tenants/${tenantId}/connected-apps`),
  adminLogAccess: (action: string, targetTenantId: string, deskripsi: string) =>
    request(`/admin/audit-logs`, { method: 'POST', body: JSON.stringify({ action, targetTenantId, deskripsi }) }),
  adminGetAuditLogs: () => request<AuditLog[]>(`/admin/audit-logs`),
  adminGetAllApiKeys: () => request<any[]>(`/admin/api-keys`),

  // --- INTEGRATION LOGS API ---
  getIntegrationLogs: (tenantId: string) => request<IntegrationLog[]>(`/internal/integration-logs/tenant/${tenantId}`),

  // --- AUTH API ---
  login: (email: string, password: string) => request<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; nama: string; email: string; role: string; tenantId: string | null; };
  }>(`/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) }),
  forgotPassword: (email: string) => request<any>(`/auth/forgot-password`, { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) => request<any>(`/auth/reset-password`, { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  refreshToken: (refreshToken: string) => request<{ accessToken: string }>(`/auth/refresh-token`, { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  // --- USER MANAGEMENT API ---
  getUsers: (tenantId?: string) => request<any[]>(`/users${tenantId ? `?tenantId=${tenantId}` : ''}`),
  createUser: (data: any) => request<any>(`/users`, { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request<any>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateUser: (id: string) => request<any>(`/users/${id}`, { method: 'DELETE' }),

  // --- DIMENSIONS API (V2 Delta) ---
  getDimensions: () => request<Dimension[]>('/dimensions'),
  createDimension: (data: { nama_dimension: string }) => request<Dimension>('/dimensions', { method: 'POST', body: JSON.stringify(data) }),
  addDimensionValue: (dimensionId: string, data: { kode: string; nama: string }) => request<DimensionValue>(`/dimensions/${dimensionId}/values`, { method: 'POST', body: JSON.stringify(data) }),
  removeDimension: (id: string) => request<any>(`/dimensions/${id}`, { method: 'DELETE' }),
  removeDimensionValue: (id: string) => request<any>(`/dimensions/values/${id}`, { method: 'DELETE' }),

  // --- CURRENCY API (V2 Delta) ---
  getCurrencies: () => request<Currency[]>('/currencies'),
  createCurrency: (data: { kode_iso: string; nama: string }) => request<Currency>('/currencies', { method: 'POST', body: JSON.stringify(data) }),
  getExchangeRates: (tenantId: string, tanggal?: string) => {
    const q = new URLSearchParams();
    if (tanggal) q.append('tanggal', tanggal);
    return request<ExchangeRate[]>(`/settings/exchange-rates/${tenantId}?${q.toString()}`);
  },
  setExchangeRate: (data: { tenantId: string; currencyId: string; tanggal: string; kurs: number; createdBy?: string }) =>
    request<ExchangeRate>('/settings/exchange-rates', { method: 'POST', body: JSON.stringify(data) }),

  // --- ACCOUNTING PERIOD API (V2 Delta) ---
  getFiscalYears: () => request<FiscalYear[]>('/periods/fiscal-years'),
  getAccountingPeriods: (fiscalYearId: string) => request<AccountingPeriod[]>(`/periods?fiscalYearId=${fiscalYearId}`),
  createFiscalYear: (data: any) => request<FiscalYear>('/periods/fiscal-year', { method: 'POST', body: JSON.stringify(data) }),
  closePeriod: (id: string) => request<AccountingPeriod>(`/periods/${id}/close`, { method: 'POST' }),
  reopenPeriod: (id: string) => request<AccountingPeriod>(`/periods/${id}/reopen`, { method: 'POST' }),
};

export interface AccountingPeriod {
  id: string;
  fiscalYearId: string;
  nomor_periode: number;
  tanggal_mulai: string;
  tanggal_selesai: string;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string;
  closedBy?: string;
  reopenedAt?: string;
  reopenedBy?: string;
}

export interface FiscalYear {
  id: string;
  tenantId: string;
  nama_tahun_buku: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  accountingPeriods?: AccountingPeriod[];
  createdAt: string;
}
