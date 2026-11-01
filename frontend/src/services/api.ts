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
    cashBankEnabled?: boolean;
    fixedAssetEnabled?: boolean;
  };
  _count?: {
    chartOfAccounts: number;
    apiKeys: number;
  };
}

export type ControlAccountType = 'NONE' | 'AR' | 'AP' | 'INVENTORY' | 'CASH_BANK' | 'FIXED_ASSET';
export type CashFlowCategory = 'OPERASI' | 'INVESTASI' | 'PENDANAAN';

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
  cashFlowCategory?: CashFlowCategory | null;
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
  | 'CASH_DEFAULT'
  | 'BANK_CHARGE_EXPENSE';

export interface SubledgerSetting {
  id?: string;
  tenantId: string;
  arEnabled: boolean;
  apEnabled: boolean;
  inventoryEnabled: boolean;
  orderManagementEnabled: boolean;
  cashBankEnabled?: boolean;
  fixedAssetEnabled?: boolean;
  defaultValuationMethod: 'MOVING_AVERAGE' | 'FIFO';
  overDeliveryTolerancePct: number;
  allowNegativeStock: boolean;
  creditLimitMode: 'WARN' | 'BLOCK';
  agingBuckets: number[];
  blockPeriodCloseOnRecon: boolean;
  pettyCashOverLimitMode?: 'WARN' | 'BLOCK';
  bankReconAutoMatchDays?: number;
  blockPeriodCloseOnBankRecon?: boolean;
  blockPeriodCloseOnDepreciation?: boolean;
  depreciationConvention?: 'BULAN_PENUH' | 'BULAN_BERIKUTNYA';
  autoDepreciationRun?: boolean;
  tagCodePrefix?: string | null;
  tagCodeFormat?: string;
  labelSymbology?: 'QR' | 'CODE128' | 'BOTH';
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
  cashBank?: {
    enabled: boolean;
    controlAccounts: Array<{ id: string; kode_akun: string; nama_akun: string; saldo: number }>;
    warnings: string[];
    reconciled: boolean;
  };
  fixedAsset?: {
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
  sourceDocType?: string | null;
  sourceDocId?: string | null;
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
  const headers = new Headers(options.headers);

  // Jangan set application/json jika body adalah FormData agar browser menyematkan multipart boundary
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

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
  getCoa: (kategori?: string, search?: string) => {
    const tenantId = localStorage.getItem('ledgery_current_tenant_id') || '';
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
  getIntegrationLogs: (tenantId: string, modul?: string) => {
    const q = modul && modul !== 'ALL' ? `?modul=${encodeURIComponent(modul)}` : '';
    return request<IntegrationLog[]>(`/internal/integration-logs/tenant/${tenantId}${q}`);
  },

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

  // ==========================================
  // MODUL 14: SUB LEDGER ACCOUNTS PAYABLE (AP)
  // ==========================================
  getPurchaseBills: (tenantId: string, params?: { status?: string; partnerId?: string; startDate?: string; endDate?: string; externalRef?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    if (params?.externalRef) q.append('externalRef', params.externalRef);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/ap/bills/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getOutstandingPurchaseBills: (tenantId: string, partnerId?: string) => {
    const qs = partnerId ? `?partnerId=${partnerId}` : '';
    return request<any>(`/ap/bills/${tenantId}/outstanding${qs}`).then((res: any) => res.data || res);
  },
  getPurchaseBill: (tenantId: string, id: string) =>
    request<any>(`/ap/bills/${tenantId}/${id}`).then((res: any) => res.data || res),
  createDraftPurchaseBill: (tenantId: string, data: any) =>
    request<any>(`/ap/bills/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  updateDraftPurchaseBill: (tenantId: string, id: string, data: any) =>
    request<any>(`/ap/bills/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  deleteDraftPurchaseBill: (tenantId: string, id: string) =>
    request<any>(`/ap/bills/${tenantId}/${id}`, { method: 'DELETE' }).then((res: any) => res.data || res),
  postPurchaseBill: (tenantId: string, id: string) =>
    request<any>(`/ap/bills/${tenantId}/${id}/post`, { method: 'POST' }).then((res: any) => res.data || res),
  voidPurchaseBill: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/ap/bills/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  getVendorPayments: (tenantId: string, params?: { status?: string; partnerId?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/ap/payments/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getVendorPayment: (tenantId: string, id: string) =>
    request<any>(`/ap/payments/${tenantId}/${id}`).then((res: any) => res.data || res),
  createVendorPayment: (tenantId: string, data: any) =>
    request<any>(`/ap/payments/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  voidVendorPayment: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/ap/payments/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  getDebitNotes: (tenantId: string, partnerId?: string) => {
    const qs = partnerId ? `?partnerId=${partnerId}` : '';
    return request<any>(`/ap/debit-notes/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  createDebitNote: (tenantId: string, data: any) =>
    request<any>(`/ap/debit-notes/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  voidDebitNote: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/ap/debit-notes/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  getApAgingReport: (tenantId: string, asOfDate?: string) => {
    const qs = asOfDate ? `?asOfDate=${asOfDate}` : '';
    return request<any>(`/ap/reports/aging/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getVendorLedger: (tenantId: string, partnerId: string, startDate?: string, endDate?: string) => {
    const q = new URLSearchParams();
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/ap/reports/vendor-ledger/${tenantId}/${partnerId}${qs}`).then((res: any) => res.data || res);
  },
  getPaymentSchedule: (tenantId: string, daysAhead?: number, partnerId?: string) => {
    const q = new URLSearchParams();
    if (daysAhead !== undefined) q.append('daysAhead', String(daysAhead));
    if (partnerId) q.append('partnerId', partnerId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/ap/reports/payment-schedule/${tenantId}${qs}`).then((res: any) => res.data || res);
  },

  importApOpeningBalance: (tenantId: string, data: any) =>
    request<any>(`/ap/opening-balance/${tenantId}/import`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),

  // --- INVENTORY API ---
  getItems: (tenantId: string, params?: { tipe?: string; groupCode?: string; isActive?: boolean; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.tipe) q.append('tipe', params.tipe);
    if (params?.groupCode) q.append('groupCode', params.groupCode);
    if (params?.isActive !== undefined) q.append('isActive', String(params.isActive));
    if (params?.search) q.append('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/inventory/items/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getItem: (tenantId: string, id: string) =>
    request<any>(`/inventory/items/${tenantId}/${id}`).then((res: any) => res.data || res),
  createItem: (tenantId: string, data: any) =>
    request<any>(`/inventory/items/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  updateItem: (tenantId: string, id: string, data: any) =>
    request<any>(`/inventory/items/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  deleteItem: (tenantId: string, id: string) =>
    request<any>(`/inventory/items/${tenantId}/${id}`, { method: 'DELETE' }).then((res: any) => res.data || res),
  importItems: (tenantId: string, data: any) =>
    request<any>(`/inventory/items/${tenantId}/import`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),

  getWarehouses: (tenantId: string, isActive?: boolean) => {
    const qs = isActive !== undefined ? `?isActive=${isActive}` : '';
    return request<any>(`/inventory/warehouses/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getWarehouse: (tenantId: string, id: string) =>
    request<any>(`/inventory/warehouses/${tenantId}/${id}`).then((res: any) => res.data || res),
  createWarehouse: (tenantId: string, data: any) =>
    request<any>(`/inventory/warehouses/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  updateWarehouse: (tenantId: string, id: string, data: any) =>
    request<any>(`/inventory/warehouses/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  deleteWarehouse: (tenantId: string, id: string) =>
    request<any>(`/inventory/warehouses/${tenantId}/${id}`, { method: 'DELETE' }).then((res: any) => res.data || res),
  importWarehouses: (tenantId: string, data: any) =>
    request<any>(`/inventory/warehouses/${tenantId}/import`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),

  getReceiptOthers: (tenantId: string, params?: { warehouseId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.warehouseId) q.append('warehouseId', params.warehouseId);
    if (params?.status) q.append('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/inventory/receipt-other/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getReceiptOther: (tenantId: string, id: string) =>
    request<any>(`/inventory/receipt-other/${tenantId}/${id}`).then((res: any) => res.data || res),
  createReceiptOther: (tenantId: string, data: any) =>
    request<any>(`/inventory/receipt-other/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  postReceiptOther: (tenantId: string, id: string) =>
    request<any>(`/inventory/receipt-other/${tenantId}/${id}/post`, { method: 'POST' }).then((res: any) => res.data || res),
  voidReceiptOther: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/inventory/receipt-other/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  getAdjustments: (tenantId: string, params?: { warehouseId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.warehouseId) q.append('warehouseId', params.warehouseId);
    if (params?.status) q.append('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/inventory/adjustments/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getAdjustment: (tenantId: string, id: string) =>
    request<any>(`/inventory/adjustments/${tenantId}/${id}`).then((res: any) => res.data || res),
  createAdjustment: (tenantId: string, data: any) =>
    request<any>(`/inventory/adjustments/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  postAdjustment: (tenantId: string, id: string) =>
    request<any>(`/inventory/adjustments/${tenantId}/${id}/post`, { method: 'POST' }).then((res: any) => res.data || res),
  voidAdjustment: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/inventory/adjustments/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  getTransfers: (tenantId: string, params?: { status?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/inventory/transfers/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getTransfer: (tenantId: string, id: string) =>
    request<any>(`/inventory/transfers/${tenantId}/${id}`).then((res: any) => res.data || res),
  createTransfer: (tenantId: string, data: any) =>
    request<any>(`/inventory/transfers/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  postTransfer: (tenantId: string, id: string) =>
    request<any>(`/inventory/transfers/${tenantId}/${id}/post`, { method: 'POST' }).then((res: any) => res.data || res),
  voidTransfer: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/inventory/transfers/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  importStockOpeningBalance: (tenantId: string, data: any) =>
    request<any>(`/inventory/opening-balance/${tenantId}/import`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),

  getStockCardReport: (tenantId: string, itemId: string, warehouseId: string, startDate?: string, endDate?: string) => {
    const q = new URLSearchParams();
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/inventory/reports/stock-card/${tenantId}/${itemId}/${warehouseId}${qs}`).then((res: any) => res.data || res);
  },
  getFifoLayersReport: (tenantId: string, itemId?: string, warehouseId?: string) => {
    const q = new URLSearchParams();
    if (itemId) q.append('itemId', itemId);
    if (warehouseId) q.append('warehouseId', warehouseId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/inventory/reports/fifo-layers/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getCurrentStockReport: (tenantId: string, params?: { warehouseId?: string; search?: string; groupCode?: string }) => {
    const q = new URLSearchParams();
    if (params?.warehouseId) q.append('warehouseId', params.warehouseId);
    if (params?.search) q.append('search', params.search);
    if (params?.groupCode) q.append('groupCode', params.groupCode);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/inventory/reports/current-stock/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getInventoryValuationReport: (tenantId: string, asOfDate?: string, warehouseId?: string) => {
    const q = new URLSearchParams();
    if (asOfDate) q.append('asOfDate', asOfDate);
    if (warehouseId) q.append('warehouseId', warehouseId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/inventory/reports/valuation/${tenantId}${qs}`).then((res: any) => res.data || res);
  },

  // --- ORDER MANAGEMENT API ---
  // 1. Purchase Orders
  getPurchaseOrders: (tenantId: string, params?: { status?: string; partnerId?: string; search?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.search) q.append('search', params.search);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/order-management/purchase-orders/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getPurchaseOrder: (tenantId: string, id: string) =>
    request<any>(`/order-management/purchase-orders/${tenantId}/${id}`).then((res: any) => res.data || res),
  createPurchaseOrder: (tenantId: string, data: any) =>
    request<any>(`/order-management/purchase-orders/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  updatePurchaseOrder: (tenantId: string, id: string, data: any) =>
    request<any>(`/order-management/purchase-orders/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  confirmOpenPo: (tenantId: string, id: string) =>
    request<any>(`/order-management/purchase-orders/${tenantId}/${id}/open`, { method: 'POST' }).then((res: any) => res.data || res),
  cancelPo: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/order-management/purchase-orders/${tenantId}/${id}/cancel`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),
  closePo: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/order-management/purchase-orders/${tenantId}/${id}/close`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  // 2. Goods Receipts
  getGoodsReceipts: (tenantId: string, params?: { status?: string; poId?: string; partnerId?: string; warehouseId?: string; search?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.poId) q.append('poId', params.poId);
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.warehouseId) q.append('warehouseId', params.warehouseId);
    if (params?.search) q.append('search', params.search);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/order-management/goods-receipts/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getGoodsReceipt: (tenantId: string, id: string) =>
    request<any>(`/order-management/goods-receipts/${tenantId}/${id}`).then((res: any) => res.data || res),
  createGoodsReceipt: (tenantId: string, data: any) =>
    request<any>(`/order-management/goods-receipts/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  updateGoodsReceipt: (tenantId: string, id: string, data: any) =>
    request<any>(`/order-management/goods-receipts/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  postGoodsReceipt: (tenantId: string, id: string) =>
    request<any>(`/order-management/goods-receipts/${tenantId}/${id}/post`, { method: 'POST' }).then((res: any) => res.data || res),
  voidGoodsReceipt: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/order-management/goods-receipts/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),
  createBillFromGr: (tenantId: string, id: string, data: any) =>
    request<any>(`/order-management/goods-receipts/${tenantId}/${id}/create-bill`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),

  // 3. Sales Orders
  getSalesOrders: (tenantId: string, params?: { status?: string; partnerId?: string; search?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.search) q.append('search', params.search);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/order-management/sales-orders/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getSalesOrder: (tenantId: string, id: string) =>
    request<any>(`/order-management/sales-orders/${tenantId}/${id}`).then((res: any) => res.data || res),
  getStockAvailability: (tenantId: string, itemId: string) =>
    request<any>(`/order-management/stock-availability/${tenantId}/${itemId}`).then((res: any) => res.data || res),
  createSalesOrder: (tenantId: string, data: any) =>
    request<any>(`/order-management/sales-orders/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  updateSalesOrder: (tenantId: string, id: string, data: any) =>
    request<any>(`/order-management/sales-orders/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  confirmOpenSo: (tenantId: string, id: string) =>
    request<any>(`/order-management/sales-orders/${tenantId}/${id}/open`, { method: 'POST' }).then((res: any) => res.data || res),
  cancelSo: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/order-management/sales-orders/${tenantId}/${id}/cancel`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),
  closeSo: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/order-management/sales-orders/${tenantId}/${id}/close`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),

  // 4. Delivery Orders
  getDeliveryOrders: (tenantId: string, params?: { status?: string; soId?: string; partnerId?: string; warehouseId?: string; search?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.soId) q.append('soId', params.soId);
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.warehouseId) q.append('warehouseId', params.warehouseId);
    if (params?.search) q.append('search', params.search);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/order-management/delivery-orders/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getDeliveryOrder: (tenantId: string, id: string) =>
    request<any>(`/order-management/delivery-orders/${tenantId}/${id}`).then((res: any) => res.data || res),
  createDeliveryOrder: (tenantId: string, data: any) =>
    request<any>(`/order-management/delivery-orders/${tenantId}`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  updateDeliveryOrder: (tenantId: string, id: string, data: any) =>
    request<any>(`/order-management/delivery-orders/${tenantId}/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then((res: any) => res.data || res),
  postDeliveryOrder: (tenantId: string, id: string) =>
    request<any>(`/order-management/delivery-orders/${tenantId}/${id}/post`, { method: 'POST' }).then((res: any) => res.data || res),
  voidDeliveryOrder: (tenantId: string, id: string, alasan?: string) =>
    request<any>(`/order-management/delivery-orders/${tenantId}/${id}/void`, { method: 'POST', body: JSON.stringify({ alasan }) }).then((res: any) => res.data || res),
  createInvoiceFromDo: (tenantId: string, id: string, data: any) =>
    request<any>(`/order-management/delivery-orders/${tenantId}/${id}/create-invoice`, { method: 'POST', body: JSON.stringify(data) }).then((res: any) => res.data || res),

  // 5. Order Management Reports
  getOutstandingOrdersReport: (tenantId: string, params?: { type?: 'PO' | 'SO' | 'ALL'; partnerId?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.type) q.append('type', params.type);
    if (params?.partnerId) q.append('partnerId', params.partnerId);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/order-management/reports/outstanding-orders/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getOrderFulfillmentReport: (tenantId: string, params?: { type?: 'PO' | 'SO' | 'ALL'; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.type) q.append('type', params.type);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<any>(`/order-management/reports/fulfillment/${tenantId}${qs}`).then((res: any) => res.data || res);
  },
  getGrIrClearingReport: (tenantId: string) =>
    request<any>(`/order-management/reports/gr-ir-clearing/${tenantId}`).then((res: any) => res.data || res),

  // 6. Subledger Cross-Module Reconciliation & Dashboard
  getSubledgerReconciliation: (tenantId: string, tanggal?: string) => {
    const q = tanggal ? `?tanggal=${encodeURIComponent(tanggal)}` : '';
    return request<any>(`/subledger/reconciliation/${tenantId}${q}`).then((res: any) => res.data || res);
  },
  getAccountantDashboardSummary: (tenantId: string) =>
    request<any>(`/subledger/dashboard-summary/${tenantId}`).then((res: any) => res.data || res),

  // --- CASH & BANK SUBLEDGER API (MODUL 19) ---
  getCashAccounts: (includeInactive?: boolean) => {
    const q = includeInactive ? '?includeInactive=true' : '';
    return request<CashBankAccount[]>(`/cash-bank/accounts${q}`);
  },
  getCashAccountById: (id: string) => request<CashBankAccount>(`/cash-bank/accounts/${id}`),
  createCashAccount: (data: Partial<CashBankAccount>) =>
    request<CashBankAccount>('/cash-bank/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateCashAccount: (id: string, data: Partial<CashBankAccount>) =>
    request<CashBankAccount>(`/cash-bank/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateCashAccount: (id: string) =>
    request<CashBankAccount>(`/cash-bank/accounts/${id}`, { method: 'DELETE' }),
  getCashAccountBalance: (id: string, tanggal?: string) => {
    const q = tanggal ? `?tanggal=${encodeURIComponent(tanggal)}` : '';
    return request<any>(`/cash-bank/accounts/${id}/balance${q}`);
  },

  // Penerimaan (Cash Receipts)
  getCashReceipts: () => request<CashReceipt[]>('/cash-bank/receipts'),
  getCashReceiptById: (id: string) => request<CashReceipt>(`/cash-bank/receipts/${id}`),
  createCashReceipt: (data: any) =>
    request<CashReceipt>('/cash-bank/receipts', { method: 'POST', body: JSON.stringify(data) }),
  postCashReceipt: (id: string) =>
    request<CashReceipt>(`/cash-bank/receipts/${id}/post`, { method: 'POST' }),
  voidCashReceipt: (id: string, reason?: string) =>
    request<CashReceipt>(`/cash-bank/receipts/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Pengeluaran & Voucher Kas Kecil (Cash Disbursements)
  getCashDisbursements: (docVariant?: string) => {
    const q = docVariant ? `?docVariant=${encodeURIComponent(docVariant)}` : '';
    return request<CashDisbursement[]>(`/cash-bank/disbursements${q}`);
  },
  getCashDisbursementById: (id: string) => request<CashDisbursement>(`/cash-bank/disbursements/${id}`),
  createCashDisbursement: (data: any) =>
    request<CashDisbursement>('/cash-bank/disbursements', { method: 'POST', body: JSON.stringify(data) }),
  postCashDisbursement: (id: string) =>
    request<CashDisbursement>(`/cash-bank/disbursements/${id}/post`, { method: 'POST' }),
  voidCashDisbursement: (id: string, reason?: string) =>
    request<CashDisbursement>(`/cash-bank/disbursements/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getPettyCashReplenishmentSuggestion: (accountId: string) =>
    request<any>(`/cash-bank/disbursements/replenishment-suggestion?accountId=${encodeURIComponent(accountId)}`),

  // Transfer & Pengisian Kas Kecil (Cash Transfers)
  getCashTransfers: (variant?: string) => {
    const q = variant ? `?variant=${encodeURIComponent(variant)}` : '';
    return request<CashTransfer[]>(`/cash-bank/transfers${q}`);
  },
  getCashTransferById: (id: string) => request<CashTransfer>(`/cash-bank/transfers/${id}`),
  createCashTransfer: (data: any) =>
    request<CashTransfer>('/cash-bank/transfers', { method: 'POST', body: JSON.stringify(data) }),
  postCashTransfer: (id: string) =>
    request<CashTransfer>(`/cash-bank/transfers/${id}/post`, { method: 'POST' }),
  voidCashTransfer: (id: string, reason?: string) =>
    request<CashTransfer>(`/cash-bank/transfers/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Import Saldo Awal (Cut-off)
  getCashOpeningBalanceStatus: () => request<any>('/cash-bank/opening-balance/status'),
  importCashOpeningBalance: (data: any) =>
    request<any>('/cash-bank/opening-balance', { method: 'POST', body: JSON.stringify(data) }),

  // Laporan Kas & Bank
  getCashBookReport: (accountId: string, filter?: { startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    q.append('accountId', accountId);
    if (filter?.startDate) q.append('startDate', filter.startDate);
    if (filter?.endDate) q.append('endDate', filter.endDate);
    return request<any>(`/cash-bank/reports/cash-book?${q.toString()}`);
  },
  getCashPositionReport: (asOfDate?: string) => {
    const q = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
    return request<any>(`/cash-bank/reports/position${q}`);
  },
  getCashProjectionReport: (horizonDays?: number, bucketMode?: 'WEEKLY' | 'MONTHLY') => {
    const q = new URLSearchParams();
    if (horizonDays) q.append('horizonDays', String(horizonDays));
    if (bucketMode) q.append('bucketMode', bucketMode);
    return request<any>(`/cash-bank/reports/projection?${q.toString()}`);
  },
  getDirectCashFlowReport: (filter?: { startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (filter?.startDate) q.append('startDate', filter.startDate);
    if (filter?.endDate) q.append('endDate', filter.endDate);
    return request<any>(`/cash-bank/reports/cash-flow-direct?${q.toString()}`);
  },

  // --- REKONSILIASI BANK API (MODUL 20) ---
  getBankImportTemplate: (cashBankAccountId: string) =>
    request<BankImportTemplate | null>(`/bank-reconciliation/templates/${cashBankAccountId}`),
  saveBankImportTemplate: (payload: any) =>
    request<BankImportTemplate>('/bank-reconciliation/templates', { method: 'POST', body: JSON.stringify(payload) }),
  uploadBankStatement: (cashBankAccountId: string, file: File, templateConfig?: any) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('cashBankAccountId', cashBankAccountId);
    if (templateConfig) {
      fd.append('templateConfig', JSON.stringify(templateConfig));
    }
    return request<any>('/bank-reconciliation/upload-statement', { method: 'POST', body: fd });
  },
  importBankStatementLines: (payload: any) =>
    request<any>('/bank-reconciliation/import-lines', { method: 'POST', body: JSON.stringify(payload) }),
  getBankStatementLines: (cashBankAccountId: string, filter?: { matchStatus?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (filter?.matchStatus) q.append('matchStatus', filter.matchStatus);
    if (filter?.startDate) q.append('startDate', filter.startDate);
    if (filter?.endDate) q.append('endDate', filter.endDate);
    return request<BankStatementLine[]>(`/bank-reconciliation/statement-lines/${cashBankAccountId}?${q.toString()}`);
  },
  getBankBookEntries: (cashBankAccountId: string, tanggalAkhir?: string) => {
    const q = new URLSearchParams();
    if (tanggalAkhir) q.append('tanggalAkhir', tanggalAkhir);
    return request<CashBankEntry[]>(`/bank-reconciliation/book-entries/${cashBankAccountId}?${q.toString()}`);
  },
  getBankAutoMatchRecommendations: (cashBankAccountId: string) =>
    request<BankAutoMatchRecommendation[]>(`/bank-reconciliation/auto-match-recommendations/${cashBankAccountId}`),
  batchAcceptBankMatches: (payload: { matches: Array<{ statementLineId: string; cashBankEntryIds: string[] }> }) =>
    request<any>('/bank-reconciliation/batch-accept-matches', { method: 'POST', body: JSON.stringify(payload) }),
  manualMatchBank: (payload: { statementLineId: string; allocations: Array<{ cashBankEntryId: string; jumlahAlokasi: number }> }) =>
    request<any>('/bank-reconciliation/manual-match', { method: 'POST', body: JSON.stringify(payload) }),
  unmatchBank: (statementLineId: string) =>
    request<any>(`/bank-reconciliation/unmatch/${statementLineId}`, { method: 'POST' }),
  ignoreBankStatementLine: (statementLineId: string, reason: string) =>
    request<any>(`/bank-reconciliation/ignore-line/${statementLineId}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  unignoreBankStatementLine: (statementLineId: string) =>
    request<any>(`/bank-reconciliation/unignore-line/${statementLineId}`, { method: 'POST' }),
  createBankAdjustmentDoc: (payload: { statementLineId: string; akunLawanId: string; keterangan?: string }) =>
    request<any>('/bank-reconciliation/adjustment-doc', { method: 'POST', body: JSON.stringify(payload) }),
  getBankReconSummary: (cashBankAccountId: string, tanggalAkhir: string, saldoRekeningKoran?: number) => {
    const q = new URLSearchParams({ tanggalAkhir });
    if (saldoRekeningKoran !== undefined) q.append('saldoRekeningKoran', String(saldoRekeningKoran));
    return request<BankReconciliationSummary>(`/bank-reconciliation/summary/${cashBankAccountId}?${q.toString()}`);
  },
  completeBankReconciliation: (payload: { cashBankAccountId: string; tanggalAkhir: string; saldoRekeningKoran: number }) =>
    request<any>('/bank-reconciliation/complete', { method: 'POST', body: JSON.stringify(payload) }),
  reopenBankReconciliation: (id: string, reason: string) =>
    request<any>(`/bank-reconciliation/reopen/${id}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getBankReconciliationHistory: (cashBankAccountId?: string) => {
    const q = new URLSearchParams();
    if (cashBankAccountId) q.append('cashBankAccountId', cashBankAccountId);
    return request<BankReconciliation[]>(`/bank-reconciliation/history?${q.toString()}`);
  },
  getBankReconciliationDetail: (id: string) =>
    request<any>(`/bank-reconciliation/detail/${id}`),

  // ==========================================
  // 9. FIXED ASSET & CIP (MODUL 21)
  // ==========================================
  getFiscalGroups: () =>
    request<FiscalDepreciationGroup[]>('/fixed-assets/fiscal-groups'),
  getFiscalGroup: (id: string) =>
    request<FiscalDepreciationGroup>(`/fixed-assets/fiscal-groups/${id}`),
  createFiscalGroup: (payload: any) =>
    request<FiscalDepreciationGroup>('/fixed-assets/fiscal-groups', { method: 'POST', body: JSON.stringify(payload) }),
  updateFiscalGroup: (id: string, payload: any) =>
    request<FiscalDepreciationGroup>(`/fixed-assets/fiscal-groups/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteFiscalGroup: (id: string) =>
    request<any>(`/fixed-assets/fiscal-groups/${id}`, { method: 'DELETE' }),
  seedFiscalGroups: (specificIndustries = false) =>
    request<any>(`/fixed-assets/fiscal-groups/seed?specificIndustries=${specificIndustries}`, { method: 'POST' }),

  getAssetCategories: () =>
    request<AssetCategory[]>('/fixed-assets/categories'),
  getAssetCategory: (id: string) =>
    request<AssetCategory>(`/fixed-assets/categories/${id}`),
  createAssetCategory: (payload: any) =>
    request<AssetCategory>('/fixed-assets/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateAssetCategory: (id: string, payload: any) =>
    request<AssetCategory>(`/fixed-assets/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAssetCategory: (id: string) =>
    request<any>(`/fixed-assets/categories/${id}`, { method: 'DELETE' }),

  getFixedAssets: (filters?: { status?: string; categoryId?: string; searchQuery?: string; externalRef?: string }) => {
    const q = new URLSearchParams();
    if (filters?.status) q.append('status', filters.status);
    if (filters?.categoryId) q.append('categoryId', filters.categoryId);
    if (filters?.searchQuery) q.append('searchQuery', filters.searchQuery);
    if (filters?.externalRef) q.append('externalRef', filters.externalRef);
    return request<FixedAsset[]>(`/fixed-assets?${q.toString()}`);
  },
  getFixedAsset: (id: string) =>
    request<FixedAsset>(`/fixed-assets/${id}`),
  createFixedAsset: (payload: any) =>
    request<FixedAsset>('/fixed-assets', { method: 'POST', body: JSON.stringify(payload) }),
  updateFixedAsset: (id: string, payload: any) =>
    request<FixedAsset>(`/fixed-assets/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  activateFixedAsset: (id: string, payload: { tanggalMulaiDigunakan: string; umurManfaatBulan?: number; nilaiResidu?: number }) =>
    request<FixedAsset>(`/fixed-assets/${id}/activate`, { method: 'POST', body: JSON.stringify(payload) }),
  capitalizeCip: (id: string, payload: { categoryId: string; tanggal: string; tanggalMulaiDigunakan: string }) =>
    request<any>(`/fixed-assets/${id}/capitalize`, { method: 'POST', body: JSON.stringify(payload) }),
  duplicateNAsset: (id: string, n: number) =>
    request<any>(`/fixed-assets/${id}/duplicate-n`, { method: 'POST', body: JSON.stringify({ n }) }),
  importAssetOpeningBalance: (payload: { items: any[] }) =>
    request<any>('/fixed-assets/opening-balance', { method: 'POST', body: JSON.stringify(payload) }),
  uploadAssetAttachment: (id: string, payload: { namaFile: string; tipe: string; fileBase64: string }) =>
    request<any>(`/fixed-assets/${id}/attachments`, { method: 'POST', body: JSON.stringify(payload) }),
  getAssetTimeline: (id: string) =>
    request<any[]>(`/fixed-assets/${id}/timeline`),

  // ==========================================
  // MODUL 22: PROSES PENYUSUTAN BULANAN & JADWAL
  // ==========================================
  getDepreciationRuns: () =>
    request<AssetDepreciationRun[]>('/fixed-assets/depreciation/runs'),
  getDepreciationPreview: (periodId: string) =>
    request<DepreciationPreviewResult>(`/fixed-assets/depreciation/preview?periodId=${periodId}`),
  postDepreciationRun: (periodId: string) =>
    request<any>('/fixed-assets/depreciation/runs', { method: 'POST', body: JSON.stringify({ periodId }) }),
  reverseDepreciationRun: (runId: string) =>
    request<any>(`/fixed-assets/depreciation/runs/${runId}/reverse`, { method: 'POST' }),
  getAssetSchedule: (assetId: string) =>
    request<AssetDepreciationSchedule>(`/fixed-assets/${assetId}/schedule`),
  addAssetCostAddition: (assetId: string, payload: { tanggal: string; jumlah: number; akunLawanId: string; deskripsi?: string; dimensions?: any }) =>
    request<any>(`/fixed-assets/${assetId}/cost-additions`, { method: 'POST', body: JSON.stringify(payload) }),
  recordAssetEstimateChange: (assetId: string, payload: { berlakuMulaiPeriode: string; umurBaruBulan?: number; sisaUmurBulan?: number; residuBaru?: number; metodeBaru?: string; alasan: string }) =>
    request<any>(`/fixed-assets/${assetId}/estimate-changes`, { method: 'POST', body: JSON.stringify(payload) }),
  verifyAndSyncAssetBalances: (assetId?: string) =>
    request<any>(`/fixed-assets/verify-sync${assetId ? `?assetId=${assetId}` : ''}`, { method: 'POST' }),

  // ==========================================
  // MODUL 25: LAPORAN FINANSIAL ASET TETAP
  // ==========================================
  getFixedAssetListReport: (params?: { asOfDate?: string; categoryId?: string; dimensionValueId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.asOfDate) qs.append('asOfDate', params.asOfDate);
    if (params?.categoryId) qs.append('categoryId', params.categoryId);
    if (params?.dimensionValueId) qs.append('dimensionValueId', params.dimensionValueId);
    return request<any>(`/fixed-assets/reports/list?${qs.toString()}`);
  },
  getFixedAssetRollForwardReport: (params: { startDate: string; endDate: string; categoryId?: string }) => {
    const qs = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate });
    if (params.categoryId) qs.append('categoryId', params.categoryId);
    return request<any>(`/fixed-assets/reports/roll-forward?${qs.toString()}`);
  },
  getFixedAssetDepreciationByDimension: (params?: { periodId?: string; startDate?: string; endDate?: string; dimensionId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.periodId) qs.append('periodId', params.periodId);
    if (params?.startDate) qs.append('startDate', params.startDate);
    if (params?.endDate) qs.append('endDate', params.endDate);
    if (params?.dimensionId) qs.append('dimensionId', params.dimensionId);
    return request<any>(`/fixed-assets/reports/by-dimension?${qs.toString()}`);
  },
  getFixedAssetProjectionReport: (params?: { categoryId?: string; assetId?: string; years?: number }) => {
    const qs = new URLSearchParams();
    if (params?.categoryId) qs.append('categoryId', params.categoryId);
    if (params?.assetId) qs.append('assetId', params.assetId);
    if (params?.years) qs.append('years', params.years.toString());
    return request<any>(`/fixed-assets/reports/projection?${qs.toString()}`);
  },
  getFixedAssetCommercialVsFiscal: (params?: { fiscalYear?: number; categoryId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.fiscalYear) qs.append('fiscalYear', params.fiscalYear.toString());
    if (params?.categoryId) qs.append('categoryId', params.categoryId);
    return request<any>(`/fixed-assets/reports/commercial-vs-fiscal?${qs.toString()}`);
  },
  getFixedAssetFullyDepreciated: (params?: { categoryId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.categoryId) qs.append('categoryId', params.categoryId);
    return request<any>(`/fixed-assets/reports/fully-depreciated?${qs.toString()}`);
  },
  getFixedAssetDisposalGainLoss: (params: { startDate: string; endDate: string; categoryId?: string }) => {
    const qs = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate });
    if (params.categoryId) qs.append('categoryId', params.categoryId);
    return request<any>(`/fixed-assets/reports/disposal-gain-loss?${qs.toString()}`);
  },
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

// ==========================================
// MODUL 14: SUB LEDGER ACCOUNTS PAYABLE (AP)
// ==========================================
export type PurchaseBillStatus = 'DRAFT' | 'POSTED' | 'PARTIAL' | 'PAID' | 'VOID';
export type VendorPaymentStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type DebitNoteStatus = 'DRAFT' | 'POSTED' | 'VOID';

export interface PurchaseBillLine {
  id?: string;
  billId?: string;
  itemId?: string | null;
  itemType?: 'STOCK' | 'SERVICE';
  deskripsi: string;
  qty: number;
  hargaSatuan: number;
  diskon?: number;
  ppnRate?: number;
  jumlah: number;
  akunBiayaId?: string | null;
  dimensions?: any;
  sourceLineType?: 'PO_LINE' | 'GR_LINE' | null;
  sourceLineId?: string | null;
  akunBiaya?: ChartOfAccount;
}

export interface PurchaseBill {
  id: string;
  tenantId: string;
  noDokumen: string;
  noFakturVendor?: string | null;
  nomorFakturPajakMasukan?: string | null;
  tanggal: string;
  jatuhTempo: string;
  partnerId: string;
  mata_uang: string;
  kurs: number;
  status: PurchaseBillStatus;
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
  lines: PurchaseBillLine[];
  journal?: { id: string; no_voucher: string; status: string } | null;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  billId?: string | null;
  debitNoteId?: string | null;
  jumlahAlokasi: number;
  kursAlokasi: number;
  selisihKurs: number;
  tanggalAlokasi: string;
  bill?: PurchaseBill;
  debitNote?: DebitNote;
}

export interface VendorPayment {
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
  status: VendorPaymentStatus;
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
  allocations: PaymentAllocation[];
  journal?: any;
}

export interface DebitNoteLine {
  id?: string;
  debitNoteId?: string;
  itemId?: string | null;
  itemType?: 'STOCK' | 'SERVICE';
  deskripsi: string;
  qty: number;
  hargaSatuan: number;
  diskon?: number;
  ppnRate?: number;
  jumlah: number;
  akunBiayaId?: string | null;
  dimensions?: any;
}

export interface DebitNote {
  id: string;
  tenantId: string;
  noDokumen: string;
  billId?: string | null;
  partnerId: string;
  tanggal: string;
  mata_uang: string;
  kurs: number;
  returnStock: boolean;
  status: DebitNoteStatus;
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
  lines: DebitNoteLine[];
  journal?: any;
}

export interface PaymentScheduleItem {
  id: string;
  noDokumen: string;
  noFakturVendor?: string | null;
  partnerId: string;
  partnerKode: string;
  partnerNama: string;
  tanggal: string;
  jatuhTempo: string;
  daysUntilDue: number;
  urgency: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING';
  mata_uang: string;
  kurs: number;
  total: number;
  saldo: number;
  saldoFungsional: number;
}

export interface PaymentScheduleResponse {
  asOfDate: string;
  daysAhead: number;
  cutOffDate: string;
  totalBills: number;
  totalKomitmenFungsional: number;
  summary: {
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    dueLater: number;
  };
  items: PaymentScheduleItem[];
}

// ==========================================
// MODUL 15: SUB LEDGER INVENTORY (PERSEDIAAN)
// ==========================================
export type ItemType = 'STOK' | 'NON_STOK' | 'JASA';
export type InventoryValuationMethod = 'MOVING_AVERAGE' | 'FIFO';
export type StockAdjustmentStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type StockTransferStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type StockReceiptOtherStatus = 'DRAFT' | 'POSTED' | 'VOID';

export interface Warehouse {
  id: string;
  tenantId: string;
  kode: string;
  nama: string;
  alamat?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockBalance {
  id: string;
  tenantId: string;
  itemId: string;
  warehouseId: string;
  qty: number;
  nilai: number;
  biayaRataRata: number;
  warehouse?: Warehouse;
}

export interface Item {
  id: string;
  tenantId: string;
  kode: string;
  nama: string;
  groupCode?: string | null;
  satuan: string;
  tipe: ItemType;
  akunPersediaanId?: string | null;
  akunHppId?: string | null;
  akunPendapatanId?: string | null;
  valuationMethod: InventoryValuationMethod;
  externalRef?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  akunPersediaan?: ChartOfAccount;
  akunHpp?: ChartOfAccount;
  akunPendapatan?: ChartOfAccount;
  balances?: StockBalance[];
}

export interface StockCostLayer {
  id: string;
  tenantId: string;
  itemId: string;
  warehouseId: string;
  movementMasukId?: string | null;
  tanggalMasuk: string;
  qtyAwal: number;
  qtySisa: number;
  biayaSatuan: number;
}

export interface StockReceiptOtherLine {
  id?: string;
  receiptOtherId?: string;
  itemId: string;
  qty: number;
  biayaSatuan: number;
  totalNilai: number;
  catatan?: string | null;
  item?: Item;
}

export interface StockReceiptOther {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  warehouseId: string;
  akunLawanId: string;
  status: StockReceiptOtherStatus;
  totalNilai: number;
  catatan?: string | null;
  externalRef?: string | null;
  journalId?: string | null;
  voidJournalId?: string | null;
  postedAt?: string | null;
  createdAt: string;
  warehouse?: Warehouse;
  akunLawan?: ChartOfAccount;
  journal?: any;
  lines: StockReceiptOtherLine[];
}

export interface StockAdjustmentLine {
  id?: string;
  adjustmentId?: string;
  itemId: string;
  qtySistem: number;
  qtyFisik: number;
  selisihQty: number;
  biayaSatuan: number;
  selisihNilai: number;
  catatan?: string | null;
  item?: Item;
}

export interface StockAdjustment {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  warehouseId: string;
  status: StockAdjustmentStatus;
  totalSelisihNilai: number;
  catatan?: string | null;
  journalId?: string | null;
  voidJournalId?: string | null;
  postedAt?: string | null;
  createdAt: string;
  warehouse?: Warehouse;
  journal?: any;
  lines: StockAdjustmentLine[];
}

export interface StockTransferLine {
  id?: string;
  transferId?: string;
  itemId: string;
  qty: number;
  biayaSatuan: number;
  totalNilai: number;
  item?: Item;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: StockTransferStatus;
  totalNilai: number;
  catatan?: string | null;
  journalId?: string | null;
  voidJournalId?: string | null;
  postedAt?: string | null;
  createdAt: string;
  fromWarehouse?: Warehouse;
  toWarehouse?: Warehouse;
  journal?: any;
  lines: StockTransferLine[];
}

// --- ORDER MANAGEMENT INTERFACES ---
export type OrderStatus = 'DRAFT' | 'OPEN' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED' | 'CLOSED';
export type GoodsReceiptStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type DeliveryOrderStatus = 'DRAFT' | 'POSTED' | 'VOID';

export interface PurchaseOrderLine {
  id?: string;
  poId?: string;
  itemId?: string | null;
  deskripsi: string;
  qty: number;
  harga: number;
  diskon?: number;
  ppnRate?: number;
  warehouseId?: string | null;
  qtyDiterima: number;
  qtyDitagih: number;
  dimensions?: any;
  item?: Item;
  warehouse?: Warehouse;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  tanggalDiharapkan?: string | null;
  partnerId: string;
  mata_uang: string;
  kurs: number;
  status: OrderStatus;
  subtotal: number;
  diskon: number;
  ppn: number;
  total: number;
  externalRef?: string | null;
  idempotencyKey?: string | null;
  catatan?: string | null;
  partner: BusinessPartner;
  lines: PurchaseOrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptLine {
  id?: string;
  receiptId?: string;
  poLineId?: string | null;
  itemId: string;
  deskripsi?: string | null;
  qty: number;
  biayaSatuan: number;
  qtyDitagih: number;
  dimensions?: any;
  item?: Item;
  poLine?: PurchaseOrderLine;
}

export interface GoodsReceipt {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  poId?: string | null;
  partnerId: string;
  warehouseId: string;
  status: GoodsReceiptStatus;
  journalId?: string | null;
  voidJournalId?: string | null;
  externalRef?: string | null;
  idempotencyKey?: string | null;
  catatan?: string | null;
  partner: BusinessPartner;
  warehouse: Warehouse;
  po?: PurchaseOrder;
  journal?: any;
  voidJournal?: any;
  lines: GoodsReceiptLine[];
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderLine {
  id?: string;
  soId?: string;
  itemId?: string | null;
  deskripsi: string;
  qty: number;
  harga: number;
  diskon?: number;
  ppnRate?: number;
  warehouseId?: string | null;
  qtyDikirim: number;
  qtyDitagih: number;
  dimensions?: any;
  item?: Item;
  warehouse?: Warehouse;
}

export interface SalesOrder {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  tanggalDiharapkan?: string | null;
  partnerId: string;
  mata_uang: string;
  kurs: number;
  status: OrderStatus;
  subtotal: number;
  diskon: number;
  ppn: number;
  total: number;
  externalRef?: string | null;
  idempotencyKey?: string | null;
  catatan?: string | null;
  partner: BusinessPartner;
  lines: SalesOrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryOrderLine {
  id?: string;
  deliveryOrderId?: string;
  soLineId?: string | null;
  itemId: string;
  deskripsi?: string | null;
  qty: number;
  biayaTotal: number;
  qtyDitagih: number;
  dimensions?: any;
  item?: Item;
  soLine?: SalesOrderLine;
}

export interface DeliveryOrder {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  soId?: string | null;
  partnerId: string;
  warehouseId: string;
  status: DeliveryOrderStatus;
  journalId?: string | null;
  voidJournalId?: string | null;
  externalRef?: string | null;
  idempotencyKey?: string | null;
  catatan?: string | null;
  partner: BusinessPartner;
  warehouse: Warehouse;
  so?: SalesOrder;
  journal?: any;
  voidJournal?: any;
  lines: DeliveryOrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationAccountResult {
  controlType: 'AR' | 'AP' | 'INVENTORY' | 'GR_IR_CLEARING';
  account: {
    id: string;
    kode: string;
    nama: string;
  } | null;
  normalBalance: 'DEBIT' | 'KREDIT';
  glBalance: number;
  subledgerBalance: number;
  selisih: number;
  status: 'OK' | 'SELISIH';
  keterangan: string;
  drillDown: {
    unpostedOrOrphanDocs: any[];
    rawOrUnlinkedJournals: any[];
    summary: {
      totalOrphanDocs: number;
      totalRawJournals: number;
      totalRawJournalValue: number;
    };
  };
}

export interface CashBankAccountReconItem {
  id: string;
  kode: string;
  nama: string;
  jenis: string;
  mata_uang: string;
  chartOfAccount: {
    id: string;
    kode_akun: string;
    nama_akun: string;
  };
  glBalance: number;
  subledgerBalance: number;
  selisih: number;
  status: 'OK' | 'SELISIH';
  drillDown: {
    unlinkedEntries: any[];
    rawJournals: any[];
  };
}

export interface ReconciliationCashBankResult {
  controlType: 'CASH_BANK';
  status: 'OK' | 'SELISIH';
  totalGlBalance: number;
  totalSubledgerBalance: number;
  totalSelisih: number;
  selisih: number;
  accounts: CashBankAccountReconItem[];
  drillDown: {
    unpostedOrOrphanDocs: any[];
    rawOrUnlinkedJournals: any[];
    summary: {
      totalOrphanDocs: number;
      totalRawJournals: number;
      totalRawJournalValue: number;
    };
  };
}

export interface FixedAssetCategoryReconItem {
  id: string;
  kode: string;
  nama: string;
  perolehan: {
    accountId: string;
    kodeAkun: string;
    namaAkun: string;
    glBalance: number;
    subledgerBalance: number;
    selisih: number;
    status: 'OK' | 'SELISIH';
  };
  akumulasi: {
    accountId: string;
    kodeAkun: string;
    namaAkun: string;
    glBalance: number;
    subledgerBalance: number;
    selisih: number;
    status: 'OK' | 'SELISIH';
  };
  cip?: {
    accountId: string;
    kodeAkun: string;
    namaAkun: string;
    glBalance: number;
    subledgerBalance: number;
    selisih: number;
    status: 'OK' | 'SELISIH';
  } | null;
  status: 'OK' | 'SELISIH';
  totalSelisih: number;
}

export interface ReconciliationFixedAssetResult {
  controlType: 'FIXED_ASSET';
  status: 'OK' | 'SELISIH';
  totalGlPerolehan: number;
  totalSubledgerPerolehan: number;
  totalGlAkumulasi: number;
  totalSubledgerAkumulasi: number;
  totalGlCip: number;
  totalSubledgerCip: number;
  totalSelisih: number;
  selisih: number;
  categories: FixedAssetCategoryReconItem[];
  drillDown: {
    unpostedOrOrphanDocs: any[];
    rawOrUnlinkedJournals: any[];
    mismatchedAssets: any[];
    summary: {
      totalOrphanDocs: number;
      totalRawJournals: number;
      totalRawJournalValue: number;
      totalMismatchedAssets: number;
    };
  };
}

export interface SubledgerReconciliationSummary {
  tanggal: string;
  isFullyReconciled: boolean;
  totalSelisihAbsolut: number;
  setting: {
    arEnabled: boolean;
    apEnabled: boolean;
    inventoryEnabled: boolean;
    orderManagementEnabled: boolean;
    blockPeriodCloseOnRecon: boolean;
    cashBankEnabled?: boolean;
    fixedAssetEnabled?: boolean;
    blockPeriodCloseOnBankRecon?: boolean;
    blockPeriodCloseOnDepreciation?: boolean;
  };
  accounts: {
    ar: ReconciliationAccountResult;
    ap: ReconciliationAccountResult;
    inventory: ReconciliationAccountResult;
    grIrClearing: ReconciliationAccountResult;
    cashBank?: ReconciliationCashBankResult;
    fixedAsset?: ReconciliationFixedAssetResult;
  };
}

export interface AccountantDashboardSummary {
  totalPiutang: number;
  totalHutang: number;
  nilaiPersediaan: number;
  totalUnbilledGr: number;
  totalKasBank?: number;
  saldoPerRekening?: Array<{
    id: string;
    kode: string;
    nama: string;
    jenis: string;
    mata_uang: string;
    saldo: number;
    status: 'OK' | 'SELISIH';
  }>;
  nilaiTercatatAset?: number;
  jumlahAsetBelumDilabel?: number;
  statusRekonsiliasiBank?: Array<{
    cashBankAccountId: string;
    kodeRekening: string;
    namaRekening: string;
    statusTerakhir: string;
    tanggalAkhir?: string | null;
    selisih: number;
  }>;
  statusPenyusutanPeriodeBerjalan?: string;
  jumlahFakturJatuhTempo: number;
  detailJatuhTempo: {
    piutangJatuhTempo: number;
    hutangJatuhTempo: number;
  };
  jumlahPoTerbuka: number;
  jumlahSoTerbuka: number;
  statusRekonsiliasi: 'OK' | 'SELISIH';
  totalSelisihAbsolut: number;
  accounts: {
    ar: { status: 'OK' | 'SELISIH'; selisih: number };
    ap: { status: 'OK' | 'SELISIH'; selisih: number };
    inventory: { status: 'OK' | 'SELISIH'; selisih: number };
    grIrClearing: { status: 'OK' | 'SELISIH'; selisih: number };
    cashBank?: { status: 'OK' | 'SELISIH'; selisih: number };
    fixedAsset?: { status: 'OK' | 'SELISIH'; selisih: number };
  };
}

// =========================================================================
// CASH & BANK SUBLEDGER INTERFACES (MODUL 19)
// =========================================================================

export type CashBankAccountType = 'KAS_TUNAI' | 'KAS_KECIL' | 'BANK' | 'DOMPET_DIGITAL';
export type CashBankEntryDirection = 'MASUK' | 'KELUAR';
export type CashBankSourceType =
  | 'CASH_RECEIPT'
  | 'CASH_DISBURSEMENT'
  | 'CASH_TRANSFER'
  | 'PETTY_REPLENISH'
  | 'PETTY_VOUCHER'
  | 'CUSTOMER_RECEIPT'
  | 'VENDOR_PAYMENT'
  | 'JOURNAL_CAPTURE'
  | 'OPENING'
  | 'OTHER';
export type CashDocStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type CashTransferVariant = 'TRANSFER' | 'PENGISIAN_KAS_KECIL';

export interface CashBankAccount {
  id: string;
  tenantId: string;
  kode: string;
  nama: string;
  jenis: CashBankAccountType;
  chartOfAccountId: string;
  mata_uang: string;
  namaBank: string | null;
  noRekening: string | null;
  namaPemilik: string | null;
  plafonKasKecil: number | null;
  externalRef: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  chartOfAccount?: ChartOfAccount;
  currentBalance?: number;
  currentBalanceFungsional?: number;
}

export interface CashReceiptLine {
  id?: string;
  headerId?: string;
  akunLawanId: string;
  deskripsi: string;
  jumlah: number;
  dimensions?: any;
  akunLawan?: ChartOfAccount;
}

export interface CashReceipt {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  cashBankAccountId: string;
  mata_uang: string;
  kurs: number;
  status: CashDocStatus;
  total: number;
  journalId?: string | null;
  externalRef?: string | null;
  idempotencyKey?: string | null;
  catatan?: string | null;
  createdBy?: string | null;
  postedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  cashBankAccount?: CashBankAccount;
  lines: CashReceiptLine[];
}

export interface CashDisbursementLine {
  id?: string;
  headerId?: string;
  akunLawanId: string;
  deskripsi: string;
  jumlah: number;
  dimensions?: any;
  akunLawan?: ChartOfAccount;
}

export interface CashDisbursement {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  cashBankAccountId: string;
  mata_uang: string;
  kurs: number;
  status: CashDocStatus;
  total: number;
  journalId?: string | null;
  externalRef?: string | null;
  idempotencyKey?: string | null;
  catatan?: string | null;
  createdBy?: string | null;
  postedAt?: string | null;
  docVariant: 'STANDARD' | 'PETTY_VOUCHER';
  replenishmentId?: string | null;
  createdAt: string;
  updatedAt: string;
  cashBankAccount?: CashBankAccount;
  lines: CashDisbursementLine[];
}

export interface CashTransfer {
  id: string;
  tenantId: string;
  noDokumen: string;
  tanggal: string;
  dariAccountId: string;
  keAccountId: string;
  jumlahKeluar: number;
  jumlahMasuk: number;
  kurs: number;
  biayaTransfer?: number | null;
  akunBiayaId?: string | null;
  variant: CashTransferVariant;
  status: CashDocStatus;
  journalId?: string | null;
  externalRef?: string | null;
  idempotencyKey?: string | null;
  catatan?: string | null;
  createdBy?: string | null;
  postedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  dariAccount?: CashBankAccount;
  keAccount?: CashBankAccount;
}

export interface CashBankEntry {
  id: string;
  tenantId: string;
  cashBankAccountId: string;
  tanggal: string;
  arah: CashBankEntryDirection;
  jumlah: number;
  jumlahFungsional: number;
  journalEntryId: string | null;
  journalId: string | null;
  sourceType: CashBankSourceType;
  sourceDocId: string | null;
  keterangan: string | null;
  reconciliationId: string | null;
  clearedAt: string | null;
  createdAt: string;
  cashBankAccount?: CashBankAccount;
}

// --- MODUL 20: REKONSILIASI BANK INTERFACES ---
export type BankMatchStatus = 'UNMATCHED' | 'MATCHED' | 'ADJUSTED' | 'IGNORED';
export type BankReconStatus = 'DRAFT' | 'SELESAI' | 'DIBUKA_KEMBALI';
export type BankImportNominalMode = 'DEBIT_KREDIT_TERPISAH' | 'SATU_KOLOM_BERTANDA';

export interface BankImportTemplate {
  id: string;
  tenantId: string;
  cashBankAccountId: string;
  pemetaanKolom: {
    tanggalCol: number;
    keteranganCol: number;
    referensiCol?: number;
    debitCol?: number;
    kreditCol?: number;
    nominalCol?: number;
    saldoCol?: number;
    startRow?: number;
  };
  formatTanggal: string;
  pemisahDesimal: string;
  pemisahRibuan: string;
  modeNominal: BankImportNominalMode;
}

export interface BankStatementLine {
  id: string;
  importId: string;
  tenantId: string;
  cashBankAccountId: string;
  tanggal: string;
  keterangan: string;
  referensi?: string | null;
  debit: number;
  kredit: number;
  saldo?: number | null;
  dedupeHash: string;
  matchStatus: BankMatchStatus;
  ignoreReason?: string | null;
  externalRef?: string | null;
  createdAt: string;
  matches?: Array<{
    id: string;
    statementLineId: string;
    cashBankEntryId: string;
    jumlahAlokasi: number;
    cashBankEntry?: CashBankEntry;
  }>;
}

export interface BankAutoMatchRecommendation {
  statementLineId: string;
  matchType: 'EXACT' | 'SUGGESTED' | 'GROUP_SUGGESTED' | 'NONE';
  confidenceScore: number;
  matchedEntryIds: string[];
  totalAllocated: number;
  reason: string;
  statementLine?: BankStatementLine;
  matchedEntries?: CashBankEntry[];
}

export interface BankReconciliationSummary {
  tanggalAkhir: string;
  saldoRekeningKoran: number;
  saldoBuku: number;
  itemBeredar: {
    setoranDalamPerjalanan: {
      total: number;
      items: CashBankEntry[];
    };
    cekBelumCair: {
      total: number;
      items: CashBankEntry[];
    };
  };
  saldoBankDisesuaikan: number;
  selisih: number;
  unmatchedStmtCount: number;
  canComplete: boolean;
}

export interface BankReconciliation {
  id: string;
  tenantId: string;
  cashBankAccountId: string;
  tanggalAkhir: string;
  saldoRekeningKoran: number;
  saldoBuku: number;
  selisih: number;
  status: BankReconStatus;
  completedBy?: string | null;
  completedAt?: string | null;
  reopenedBy?: string | null;
  reopenedAt?: string | null;
  reopenReason?: string | null;
  createdAt: string;
  updatedAt: string;
  cashBankAccount?: {
    kode: string;
    nama: string;
    namaBank?: string;
    noRekening?: string;
  };
  matches?: any[];
}

// =========================================================================
// FIXED ASSET INTERFACES (MODUL 21)
// =========================================================================

export type FiscalGroupType = 'BUKAN_BANGUNAN' | 'BANGUNAN';
export type AssetCategoryType = 'BERWUJUD' | 'TAK_BERWUJUD';
export type DepreciationMethod = 'GARIS_LURUS' | 'SALDO_MENURUN';
export type FiscalStartRule = 'BULAN_PEROLEHAN' | 'BULAN_PRODUKSI_KOMERSIAL';
export type FixedAssetStatus = 'DRAFT' | 'CIP' | 'AKTIF' | 'DISUSUTKAN_PENUH' | 'DIJUAL' | 'DIHAPUSKAN';
export type AssetLabelStatus = 'BELUM_DILABEL' | 'TERCETAK' | 'TERPASANG' | 'RUSAK_HILANG';
export type AssetEventType =
  | 'PEROLEHAN'
  | 'KAPITALISASI'
  | 'PENAMBAHAN_NILAI'
  | 'PENYUSUTAN'
  | 'PERUBAHAN_ESTIMASI'
  | 'MUTASI'
  | 'PENURUNAN_NILAI'
  | 'PELEPASAN'
  | 'PENGHAPUSAN'
  | 'VOID';

export interface FiscalDepreciationGroup {
  id: string;
  tenantId: string;
  kode: string;
  nama: string;
  jenis: FiscalGroupType;
  masaManfaatBulan: number;
  tarifGarisLurus: number;
  tarifSaldoMenurun: number | null;
  isSeed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AssetCategory {
  id: string;
  tenantId: string;
  kode: string;
  nama: string;
  jenis: AssetCategoryType;
  dapatDisusutkan: boolean;
  metodeKomersial: DepreciationMethod;
  faktorSaldoMenurun: number;
  umurManfaatBulan: number;
  nilaiResiduPersen: number | null;
  nilaiResiduNominal: number | null;
  fiscalGroupId: string | null;
  metodeFiskal: DepreciationMethod;
  aturanMulaiFiskal: FiscalStartRule;
  akunAsetId: string;
  akunAkumulasiId: string;
  akunBebanId: string;
  akunCipId: string;
  akunLabaRugiPelepasanId: string;
  akunRugiPenurunanNilaiId: string;
  akunAkumulasiPenurunanNilaiId?: string | null;
  akunRugiPenghapusanId: string;
  isActive: boolean;
  fiscalGroup?: FiscalDepreciationGroup;
  akunAset?: ChartOfAccount;
  akunAkumulasi?: ChartOfAccount;
  akunBeban?: ChartOfAccount;
  akunCip?: ChartOfAccount;
}

export interface FixedAsset {
  id: string;
  tenantId: string;
  noAset: string;
  tagCode: string;
  categoryId: string;
  nama: string;
  deskripsi?: string | null;
  status: FixedAssetStatus;
  tanggalPerolehan: string;
  tanggalMulaiDigunakan?: string | null;
  mata_uang: string;
  kurs: number;
  hargaPerolehanAsli: number;
  hargaPerolehan: number;
  nilaiResidu: number;
  umurManfaatBulan: number;
  metodeKomersial: DepreciationMethod;
  faktorSaldoMenurun: number;
  fiscalGroupId?: string | null;
  metodeFiskal: DepreciationMethod;
  fiskalMulaiTanggal?: string | null;
  fiskalUmurOverrideBulan?: number | null;
  dimensions?: any;
  statusLabel: AssetLabelStatus;
  externalRef?: string | null;
  sumberAplikasi: string;
  sourceDocType?: string | null;
  sourceDocId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  category?: AssetCategory;
  fiscalGroup?: FiscalDepreciationGroup;
  events?: AssetEvent[];
  attachments?: AssetAttachment[];
  capitalizations?: any[];
  depreciationEntries?: any[];
}

export interface AssetEvent {
  id: string;
  assetId: string;
  tipe: AssetEventType;
  tanggal: string;
  data: any;
  journalId?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface AssetAttachment {
  id: string;
  assetId: string;
  namaFile: string;
  tipe: string;
  ukuran: number;
  storageKey: string;
  uploadedBy?: string | null;
  createdAt: string;
}

export interface OpeningBalanceReconResult {
  kategoriKode: string;
  kategoriNama: string;
  jumlahUnit: number;
  subledgerPerolehan: number;
  glPerolehan: number;
  selisihPerolehan: number;
  subledgerAkumulasi: number;
  glAkumulasi: number;
  selisihAkumulasi: number;
  status: 'COCOK' | 'BELUM_REKONSILIASI';
}

// ==========================================
// MODUL 22 INTERFACES
// ==========================================

export interface DepreciationScheduleItem {
  tahun: number;
  bulan: number;
  periodeStr: string;
  beban: number | null;
  akumulasi: number | null;
  nilaiTercatat: number | null;
  keterangan: string;
  isPosted?: boolean;
  runNoDokumen?: string | null;
  entryId?: string | null;
}

export interface AssetDepreciationSchedule {
  assetId: string;
  noAset: string;
  nama: string;
  komersial: DepreciationScheduleItem[];
  fiskal: DepreciationScheduleItem[];
  komersialDisusutkanPenuh: boolean;
  fiskalDisusutkanPenuh: boolean;
}

export interface DepreciationPreviewItem {
  assetId: string;
  noAset: string;
  nama: string;
  kategoriNama: string;
  hargaPerolehan: number;
  nilaiTercatatSebelum: number;
  komersialBeban: number;
  fiskalBeban: number;
  nilaiTercatatSetelah: number;
  isCatchUp: boolean;
  catchUpBulanCount: number;
  akunBebanId: string;
  akunAkumulasiId: string;
  dimensions?: any;
}

export interface GlJournalLinePreview {
  kodeAkun: string;
  namaAkun: string;
  tipe: 'DEBIT' | 'KREDIT';
  jumlah: number;
  dimensions?: any;
}

export interface DepreciationPreviewResult {
  period: {
    id: string;
    nama: string;
    nomor_periode: number;
    tanggal_mulai: string;
    tanggal_selesai: string;
  };
  totalKomersial: number;
  totalFiskal: number;
  totalAssetsCount: number;
  catchUpAssetsCount: number;
  assets: DepreciationPreviewItem[];
  glJournalPreview: {
    debitLines: GlJournalLinePreview[];
    creditLines: GlJournalLinePreview[];
    isBalanced: boolean;
  };
  warnings: string[];
}

export interface AssetDepreciationRun {
  id: string;
  tenantId: string;
  noDokumen: string;
  periodId: string;
  status: 'POSTED' | 'REVERSED';
  totalKomersial: number;
  totalFiskal: number;
  journalId?: string | null;
  createdBy?: string | null;
  postedAt: string;
  reversedAt?: string | null;
  reversedBy?: string | null;
  createdAt: string;
  period?: {
    id: string;
    nomor_periode: number;
    status: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    fiscalYear?: {
      nama_tahun_buku: string;
    };
  };
  journal?: {
    id: string;
    no_voucher: string;
    status: string;
  };
  _count?: {
    entries: number;
  };
}






