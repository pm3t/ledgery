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
  subledgerSetting?: {
    arEnabled: boolean;
    apEnabled: boolean;
    inventoryEnabled: boolean;
    orderManagementEnabled: boolean;
  };
  _count?: {
    chartOfAccounts: number;
    apiKeys: number;
  };
}

export type ControlAccountType = 'NONE' | 'AR' | 'AP' | 'INVENTORY';

export interface ChartOfAccount {
  id: string;
  tenantId: string;
  kode_akun: string;
  nama_akun: string;
  kategori: 'ASET' | 'LIABILITAS' | 'EKUITAS' | 'PENDAPATAN' | 'BEBAN';
  parentId?: string | null;
  isActive: boolean;
  isControlAccount?: boolean;
  controlType?: ControlAccountType;
  createdAt: string;
  updatedAt: string;
  parent?: {
    id: string;
    kode_akun: string;
    nama_akun: string;
  } | null;
}

export type PostingSetupKey =
  | 'AR_CONTROL'
  | 'SALES_REVENUE'
  | 'SALES_DISCOUNT'
  | 'PPN_KELUARAN'
  | 'AP_CONTROL'
  | 'PURCHASE_EXPENSE'
  | 'PURCHASE_DISCOUNT'
  | 'PPN_MASUKAN'
  | 'INVENTORY'
  | 'COGS'
  | 'INVENTORY_ADJUSTMENT'
  | 'GR_IR_CLEARING'
  | 'PURCHASE_PRICE_VARIANCE'
  | 'FX_GAIN_LOSS'
  | 'CASH_DEFAULT';

export interface SubledgerSetting {
  id?: string;
  tenantId: string;
  arEnabled: boolean;
  apEnabled: boolean;
  inventoryEnabled: boolean;
  orderManagementEnabled: boolean;
  defaultValuationMethod: 'MOVING_AVERAGE' | 'FIFO';
  overDeliveryTolerancePct: number;
  allowNegativeStock: boolean;
  creditLimitMode: 'WARN' | 'BLOCK';
  agingBuckets: number[];
  blockPeriodCloseOnRecon: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PostingSetupItem {
  id: string;
  tenantId: string;
  key: PostingSetupKey;
  accountId: string;
  groupCode?: string | null;
  account?: ChartOfAccount;
}

export interface BusinessPartner {
  id: string;
  tenantId: string;
  kode: string;
  nama: string;
  npwp?: string | null;
  alamat?: string | null;
  kontak?: string | null;
  termPembayaranHari: number;
  creditLimit?: number | null;
  mata_uang: string;
  isCustomer: boolean;
  isVendor: boolean;
  groupCode?: string | null;
  externalRef?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivationCheckResult {
  ar: {
    enabled: boolean;
    controlAccounts: Array<{ id: string; kode_akun: string; nama_akun: string; saldo: number }>;
    warnings: string[];
    reconciled: boolean;
  };
  ap: {
    enabled: boolean;
    controlAccounts: Array<{ id: string; kode_akun: string; nama_akun: string; saldo: number }>;
    warnings: string[];
    reconciled: boolean;
  };
  inventory: {
    enabled: boolean;
    controlAccounts: Array<{ id: string; kode_akun: string; nama_akun: string; saldo: number }>;
    warnings: string[];
    reconciled: boolean;
  };
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
    controlType?: ControlAccountType;
  }) => request<ChartOfAccount>('/chart-of-accounts', { method: 'POST', body: JSON.stringify(payload) }),

  updateCoa: (id: string, payload: Partial<{ kode_akun: string; nama_akun: string; kategori: string; parentId: string | null; isActive: boolean; isControlAccount: boolean; controlType: ControlAccountType }>) =>
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

  // --- SUBLEDGER SETTING & POSTING SETUP API ---
  getSubledgerSettings: (tenantId: string) => request<SubledgerSetting>(`/subledger/settings/${tenantId}`),
  updateSubledgerSettings: (tenantId: string, data: Partial<SubledgerSetting>) =>
    request<SubledgerSetting>(`/subledger/settings/${tenantId}`, { method: 'PUT', body: JSON.stringify(data) }),
  getPostingSetups: (tenantId: string) => request<PostingSetupItem[]>(`/subledger/posting-setup/${tenantId}`),
  upsertPostingSetup: (tenantId: string, data: { key: string; accountId: string; groupCode?: string }) =>
    request<PostingSetupItem>(`/subledger/posting-setup/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }),
  batchUpsertPostingSetups: (tenantId: string, items: Array<{ key: string; accountId: string; groupCode?: string }>) =>
    request<{ count: number }>(`/subledger/posting-setup/${tenantId}/batch`, { method: 'POST', body: JSON.stringify({ items }) }),
  checkSubledgerActivation: (tenantId: string) => request<ActivationCheckResult>(`/subledger/activation-check/${tenantId}`),

  // --- BUSINESS PARTNERS API ---
  getBusinessPartners: (tenantId: string, params?: { search?: string; type?: 'customer' | 'vendor'; groupCode?: string; isActive?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.type) q.append('type', params.type);
    if (params?.groupCode) q.append('groupCode', params.groupCode);
    if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<BusinessPartner[]>(`/business-partners/${tenantId}${qs}`);
  },
  getBusinessPartner: (tenantId: string, id: string) =>
    request<BusinessPartner>(`/business-partners/${tenantId}/${id}`),
  createBusinessPartner: (tenantId: string, data: Partial<BusinessPartner>) =>
    request<BusinessPartner>(`/business-partners/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateBusinessPartner: (tenantId: string, id: string, data: Partial<BusinessPartner>) =>
    request<BusinessPartner>(`/business-partners/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBusinessPartner: (tenantId: string, id: string) =>
    request<{ message: string; softDeleted: boolean }>(`/business-partners/${tenantId}/${id}`, { method: 'DELETE' }),
  importBusinessPartners: (tenantId: string, partners: any[]) =>
    request<{ created: number; updated: number; errors: any[] }>(`/business-partners/${tenantId}/import`, { method: 'POST', body: JSON.stringify({ partners }) }),

  // --- ACCOUNTS RECEIVABLE (AR) API ---
  getArInvoices: (tenantId: string, params?: { status?: string; partnerId?: string; startDate?: string; endDate?: string; search?: string; externalRef?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    if (params?.search) q.append('search', params.search);
    if (params?.externalRef) q.append('externalRef', params.externalRef);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/ar/invoices/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getOutstandingInvoices: (tenantId: string, partnerId?: string) => {
    const qs = partnerId ? `?partnerId=${partnerId}` : '';
    return request<any>(`/ar/invoices/${tenantId}/outstanding${qs}`).then((res: any) => res.data || res);
  },
  getArInvoice: (tenantId: string, id: string) =>
    request<any>(`/ar/invoices/${tenantId}/${id}`).then((res: any) => res.data || res),
  createDraftInvoice: (tenantId: string, data: any) =>
    request<any>(`/ar/invoices/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  updateDraftInvoice: (tenantId: string, id: string, data: any) =>
    request<any>(`/ar/invoices/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  deleteDraftInvoice: (tenantId: string, id: string) =>
    request<any>(`/ar/invoices/${tenantId}/${id}`, { method: 'DELETE' }),
  postArInvoice: (tenantId: string, id: string) =>
    request<any>(`/ar/invoices/${tenantId}/${id}/post`, { method: 'POST' }).then((res: any) => res.data || res),
  voidArInvoice: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/ar/invoices/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  getCustomerReceipts: (tenantId: string, params?: { partnerId?: string; startDate?: string; endDate?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    if (params?.search) q.append('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/ar/receipts/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getCustomerReceipt: (tenantId: string, id: string) =>
    request<any>(`/ar/receipts/${tenantId}/${id}`).then((res: any) => res.data || res),
  createCustomerReceipt: (tenantId: string, data: any) =>
    request<any>(`/ar/receipts/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  voidCustomerReceipt: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/ar/receipts/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  getArCreditNotes: (tenantId: string, partnerId?: string) => {
    const qs = partnerId ? `?partnerId=${partnerId}` : '';
    return request<any>(`/ar/credit-notes/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  createArCreditNote: (tenantId: string, data: any) =>
    request<any>(`/ar/credit-notes/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  voidArCreditNote: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/ar/credit-notes/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  getArAgingReport: (tenantId: string, asOfDate?: string) => {
    const qs = asOfDate ? `?asOfDate=${asOfDate}` : '';
    return request<any>(`/ar/reports/aging/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getCustomerLedger: (tenantId: string, partnerId: string, startDate?: string, endDate?: string) => {
    const q = new URLSearchParams();
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/ar/reports/customer-ledger/${tenantId}/${partnerId}${qs}`).then((res: any) => res.data || res);
  },

  importArOpeningBalance: (tenantId: string, data: any) =>
    request<any>(`/ar/opening-balance/${tenantId}/import`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
};

export type SalesInvoiceStatus = 'DRAFT' | 'POSTED' | 'PARTIAL' | 'PAID' | 'VOID';
export type CustomerReceiptStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type CreditNoteStatus = 'DRAFT' | 'POSTED' | 'VOID';

export interface SalesInvoiceLine {
  id?: string;
  invoiceId?: string;
  itemId?: string | null;
  itemType?: 'STOCK' | 'SERVICE';
  deskripsi: string;
  qty: number;
  hargaSatuan: number;
  diskon?: number;
  ppnRate?: number;
  jumlah: number;
  akunPendapatanId?: string | null;
  dimensions?: any;
  sourceLineType?: 'SO_LINE' | 'DO_LINE' | null;
  sourceLineId?: string | null;
  akunPendapatan?: ChartOfAccount;
}

export interface SalesInvoice {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  jatuhTempo: string;
  partnerId: string;
  mata_uang: string;
  kurs: number;
  status: SalesInvoiceStatus;
  subtotal: number;
  totalDiskon: number;
  totalPpn: number;
  total: number;
  totalDialokasikan: number;
  saldo: number;
  subtotalFungsional: number;
  totalDiskonFungsional: number;
  totalPpnFungsional: number;
  totalFungsional: number;
  saldoFungsional: number;
  journalId?: string | null;
  voidJournalId?: string | null;
  externalRef?: string | null;
  sumberAplikasi: string;
  idempotencyKey?: string | null;
  catatan?: string | null;
  createdBy?: string | null;
  postedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  partner?: BusinessPartner;
  lines: SalesInvoiceLine[];
  journal?: { id: string; no_voucher: string; status: string } | null;
  allocations?: ReceiptAllocation[];
}

export interface ReceiptAllocation {
  id: string;
  receiptId: string;
  invoiceId?: string | null;
  creditNoteId?: string | null;
  jumlahAlokasi: number;
  kursAlokasi: number;
  selisihKurs: number;
  tanggalAlokasi: string;
  invoice?: SalesInvoice;
}

export interface CustomerReceipt {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  partnerId: string;
  akunKasBankId: string;
  jumlah: number;
  jumlahFungsional: number;
  mata_uang: string;
  kurs: number;
  status: CustomerReceiptStatus;
  totalDialokasikan: number;
  belumDialokasikan: number;
  journalId?: string | null;
  voidJournalId?: string | null;
  externalRef?: string | null;
  catatan?: string | null;
  createdBy?: string | null;
  postedAt?: string | null;
  createdAt: string;
  partner?: BusinessPartner;
  akunKasBank?: ChartOfAccount;
  allocations: ReceiptAllocation[];
  journal?: any;
}

export interface CreditNoteLine {
  id?: string;
  creditNoteId?: string;
  itemId?: string | null;
  itemType?: 'STOCK' | 'SERVICE';
  deskripsi: string;
  qty: number;
  hargaSatuan: number;
  diskon?: number;
  ppnRate?: number;
  jumlah: number;
  akunPendapatanId?: string | null;
  dimensions?: any;
}

export interface CreditNote {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  partnerId: string;
  invoiceId?: string | null;
  returnStock: boolean;
  mata_uang: string;
  kurs: number;
  status: CreditNoteStatus;
  subtotal: number;
  totalDiskon: number;
  totalPpn: number;
  total: number;
  totalDialokasikan: number;
  saldo: number;
  subtotalFungsional: number;
  totalFungsional: number;
  journalId?: string | null;
  voidJournalId?: string | null;
  externalRef?: string | null;
  catatan?: string | null;
  partner?: BusinessPartner;
  lines: CreditNoteLine[];
  journal?: any;
}

export interface AgingBucketCustomerSummary {
  partnerId: string;
  partnerKode: string;
  partnerNama: string;
  totalPiutang: number;
  current: number;
  bucket1: number;
  bucket2: number;
  bucket3: number;
  older: number;
  invoices: Array<{
    id: string;
    noDokumen: string;
    tanggal: string;
    jatuhTempo: string;
    overdueDays: number;
    bucketCategory: string;
    mataUang: string;
    kurs: number;
    saldo: number;
    saldoFungsional: number;
    total: number;
    externalRef?: string | null;
  }>;
}

export interface ArAgingReportResponse {
  asOfDate: string;
  bucketDefinitions: {
    current: string;
    bucket1: string;
    bucket2: string;
    bucket3: string;
    older: string;
  };
  grandTotal: {
    totalPiutang: number;
    current: number;
    bucket1: number;
    bucket2: number;
    bucket3: number;
    older: number;
  };
  customers: AgingBucketCustomerSummary[];
}

export interface CustomerLedgerResponse {
  partner: BusinessPartner;
  startDate: string;
  endDate: string;
  saldoAwal: number;
  mutasi: Array<{
    tanggal: string;
    tipe: 'FAKTUR' | 'PENERIMAAN' | 'NOTA_KREDIT';
    noDokumen: string;
    deskripsi: string;
    mataUang: string;
    kurs: number;
    debit: number;
    kredit: number;
    saldoBerjalan: number;
  }>;
  saldoAkhir: number;
}

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
