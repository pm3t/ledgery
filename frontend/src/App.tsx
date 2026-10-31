import { useState, useEffect } from 'react';
import { api, Tenant } from './services/api';
import { Layout } from './components/Layout';
import { ChartOfAccountsPage } from './pages/ChartOfAccountsPage';
import { SettingsPage } from './pages/SettingsPage';
import { JournalListPage } from './pages/JournalListPage';
import { ManualJournalPage } from './pages/ManualJournalPage';
import { GeneralLedgerPage } from './pages/GeneralLedgerPage';
import { JournalApprovalPage } from './pages/JournalApprovalPage';
import { JournalApprovalHistoryPage } from './pages/JournalApprovalHistoryPage';
import { FinancialReportsPage } from './pages/FinancialReportsPage';
import { TaxPage } from './pages/TaxPage';
import { IntegrationLogPage } from './pages/IntegrationLogPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { LoginPage } from './pages/LoginPage';
import { DimensionsPage } from './pages/DimensionsPage';
import { AccountingPeriodsPage } from './pages/AccountingPeriodsPage';
import { DimensionAnalysisPage } from './pages/DimensionAnalysisPage';
import { BusinessPartnersPage } from './pages/BusinessPartnersPage';
import { SalesInvoicesPage } from './pages/ar/SalesInvoicesPage';
import { CustomerReceiptsPage } from './pages/ar/CustomerReceiptsPage';
import { CreditNotesPage } from './pages/ar/CreditNotesPage';
import { ArReportsPage } from './pages/ar/ArReportsPage';
import { ArOpeningBalancePage } from './pages/ar/ArOpeningBalancePage';
import { PurchaseBillsPage } from './pages/ap/PurchaseBillsPage';
import { VendorPaymentsPage } from './pages/ap/VendorPaymentsPage';
import { DebitNotesPage } from './pages/ap/DebitNotesPage';
import { ApReportsPage } from './pages/ap/ApReportsPage';
import { PaymentSchedulePage } from './pages/ap/PaymentSchedulePage';
import { ApOpeningBalancePage } from './pages/ap/ApOpeningBalancePage';

// Inventory Pages
import { ItemsPage } from './pages/inventory/ItemsPage';
import { WarehousesPage } from './pages/inventory/WarehousesPage';
import { StockReceiptOtherPage } from './pages/inventory/StockReceiptOtherPage';
import { StockAdjustmentPage } from './pages/inventory/StockAdjustmentPage';
import { StockTransferPage } from './pages/inventory/StockTransferPage';
import { InventoryReportsPage } from './pages/inventory/InventoryReportsPage';
import { InventoryOpeningBalancePage } from './pages/inventory/InventoryOpeningBalancePage';

// Order Management Pages
import { PurchaseOrdersPage } from './pages/order-management/PurchaseOrdersPage';
import { GoodsReceiptsPage } from './pages/order-management/GoodsReceiptsPage';
import { SalesOrdersPage } from './pages/order-management/SalesOrdersPage';
import { DeliveryOrdersPage } from './pages/order-management/DeliveryOrdersPage';
import { OrderReportsPage } from './pages/order-management/OrderReportsPage';

// Admin Pages
import { AdminLayout } from './layouts/AdminLayout';
import { AdminTenantsPage } from './pages/admin/AdminTenantsPage';
import { AdminTenantDetailPage } from './pages/admin/AdminTenantDetailPage';
import { AdminBillingPage } from './pages/admin/AdminBillingPage';

// Auth Context
import { useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';

type TenantTab =
  | 'coa'
  | 'business-partners'
  | 'settings'
  | 'journals'
  | 'journals-manual'
  | 'ledger'
  | 'journal-approval'
  | 'approval-history'
  | 'reports'
  | 'dimension-analysis'
  | 'tax'
  | 'integration-log'
  | 'user-management'
  | 'dimensions'
  | 'accounting-periods'
  | 'ar-invoices'
  | 'ar-receipts'
  | 'ar-credit-notes'
  | 'ar-reports'
  | 'ar-opening-balance'
  | 'ap-bills'
  | 'ap-payments'
  | 'ap-debit-notes'
  | 'ap-reports'
  | 'ap-payment-schedule'
  | 'ap-opening-balance'
  | 'inv-items'
  | 'inv-warehouses'
  | 'inv-receipt-other'
  | 'inv-adjustments'
  | 'inv-transfers'
  | 'inv-reports'
  | 'inv-opening-balance'
  | 'om-so'
  | 'om-do'
  | 'om-po'
  | 'om-gr'
  | 'om-reports';
type AdminTab = 'tenants' | 'billing' | 'audit' | 'api-keys' | 'user-management';

export function App() {
  const { user, loading, logout } = useAuth();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [activeTab, setActiveTab] = useState<TenantTab>('coa');
  const [selectedPoIdForGr, setSelectedPoIdForGr] = useState<string | undefined>(undefined);
  const [selectedSoIdForDo, setSelectedSoIdForDo] = useState<string | undefined>(undefined);

  // Admin states
  const [adminActiveTab, setAdminActiveTab] = useState<AdminTab>('tenants');
  const [adminSelectedTenant, setAdminSelectedTenant] = useState<Tenant | null>(null);

  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  // Deteksi mode dari URL param (setelah redirect login)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'admin' && user?.role === 'SUPER_ADMIN') {
      // Tidak perlu melakukan apapun, render kondisi di bawah sudah menentukan
    }
    // Bersihkan URL param
    if (mode) {
      window.history.replaceState({}, '', '/');
    }
  }, [user]);

  const fetchTenants = async () => {
    try {
      setTenantLoading(true);
      setTenantError(null);
      const data = await api.getTenants();
      setTenants(data);
      if (data.length > 0 && !currentTenant) {
        // Jika user STAF/ADMIN, pilih tenant sesuai tenantId mereka
        if (user?.tenantId) {
          const myTenant = data.find(t => t.id === user.tenantId);
          setCurrentTenant(myTenant || data[0]);
        } else {
          setCurrentTenant(data[0]);
        }
      }
    } catch (err: any) {
      setTenantError(err.message);
    } finally {
      setTenantLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      fetchTenants();
    } else if (user?.role === 'SUPER_ADMIN') {
      // Super admin juga perlu tenant list untuk adminTenantsPage
      fetchTenants();
    }
  }, [user]);

  // Tampilkan loading spinner saat cek token awal
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Jika belum login, tampilkan halaman Login
  if (!user) {
    return <LoginPage />;
  }

  // Render Super Admin Portal
  if (user.role === 'SUPER_ADMIN') {
    return (
      <AdminLayout
        activeTab={adminActiveTab}
        setActiveTab={(tab) => {
          setAdminActiveTab(tab);
          setAdminSelectedTenant(null);
        }}
        onLogout={logout}
      >
        {adminActiveTab === 'tenants' && !adminSelectedTenant && (
          <AdminTenantsPage onSelectTenant={(t) => setAdminSelectedTenant(t)} />
        )}
        {adminActiveTab === 'tenants' && adminSelectedTenant && (
          <AdminTenantDetailPage tenant={adminSelectedTenant} onBack={() => setAdminSelectedTenant(null)} />
        )}
        {adminActiveTab === 'billing' && <AdminBillingPage />}
        {adminActiveTab === 'user-management' && <UserManagementPage />}
        {adminActiveTab === 'audit' && (
          <div className="p-8 text-slate-400">
            Halaman Audit Log akan tersedia segera.
          </div>
        )}
        {adminActiveTab === 'api-keys' && (
          <div className="p-8 text-slate-400">
            Halaman Global API Keys akan tersedia segera.
          </div>
        )}
      </AdminLayout>
    );
  }

  // Render Tenant Portal (STAF_AKUNTANSI / ADMIN_TENANT)
  if (tenantLoading && tenants.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      tenants={tenants}
      currentTenant={currentTenant}
      onSelectTenant={(t) => setCurrentTenant(t)}
      onLogout={logout}
      currentUser={user}
    >
      {activeTab === 'coa' && <ChartOfAccountsPage currentTenant={currentTenant} />}
      {activeTab === 'business-partners' && <BusinessPartnersPage currentTenant={currentTenant} />}
      {activeTab === 'settings' && <SettingsPage currentTenant={currentTenant} />}
      {activeTab === 'journals' && <JournalListPage currentTenant={currentTenant} />}
      {activeTab === 'journals-manual' && <ManualJournalPage currentTenant={currentTenant} />}
      {activeTab === 'ledger' && <GeneralLedgerPage currentTenant={currentTenant} />}
      {activeTab === 'journal-approval' && <JournalApprovalPage currentTenant={currentTenant} />}
      {activeTab === 'approval-history' && <JournalApprovalHistoryPage currentTenant={currentTenant} />}
      {activeTab === 'reports' && <FinancialReportsPage currentTenant={currentTenant} />}
      {activeTab === 'dimension-analysis' && <DimensionAnalysisPage currentTenant={currentTenant} />}
      {activeTab === 'tax' && <TaxPage currentTenant={currentTenant} />}
      {activeTab === 'integration-log' && <IntegrationLogPage currentTenant={currentTenant} />}
      {activeTab === 'user-management' && <UserManagementPage />}
      {activeTab === 'dimensions' && <DimensionsPage currentTenant={currentTenant} />}
      {activeTab === 'accounting-periods' && <AccountingPeriodsPage currentTenant={currentTenant} />}
      {activeTab === 'ar-invoices' && <SalesInvoicesPage currentTenant={currentTenant} />}
      {activeTab === 'ar-receipts' && <CustomerReceiptsPage currentTenant={currentTenant} />}
      {activeTab === 'ar-credit-notes' && <CreditNotesPage currentTenant={currentTenant} />}
      {activeTab === 'ar-reports' && <ArReportsPage currentTenant={currentTenant} />}
      {activeTab === 'ar-opening-balance' && (
        <ArOpeningBalancePage
          currentTenant={currentTenant}
          onNavigateToInvoices={() => setActiveTab('ar-invoices')}
          onNavigateToReports={() => setActiveTab('ar-reports')}
        />
      )}
      {activeTab === 'ap-bills' && <PurchaseBillsPage currentTenant={currentTenant} />}
      {activeTab === 'ap-payments' && <VendorPaymentsPage currentTenant={currentTenant} />}
      {activeTab === 'ap-debit-notes' && <DebitNotesPage currentTenant={currentTenant} />}
      {activeTab === 'ap-reports' && <ApReportsPage currentTenant={currentTenant} />}
      {activeTab === 'ap-payment-schedule' && (
        <PaymentSchedulePage
          currentTenant={currentTenant}
          onNavigateToPayments={() => setActiveTab('ap-payments')}
        />
      )}
      {activeTab === 'ap-opening-balance' && (
        <ApOpeningBalancePage
          currentTenant={currentTenant}
          onNavigateToBills={() => setActiveTab('ap-bills')}
          onNavigateToReports={() => setActiveTab('ap-reports')}
        />
      )}
      {activeTab === 'inv-items' && <ItemsPage currentTenant={currentTenant} />}
      {activeTab === 'inv-warehouses' && <WarehousesPage currentTenant={currentTenant} />}
      {activeTab === 'inv-receipt-other' && <StockReceiptOtherPage currentTenant={currentTenant} />}
      {activeTab === 'inv-adjustments' && <StockAdjustmentPage currentTenant={currentTenant} />}
      {activeTab === 'inv-transfers' && <StockTransferPage currentTenant={currentTenant} />}
      {activeTab === 'inv-reports' && <InventoryReportsPage currentTenant={currentTenant} />}
      {activeTab === 'inv-opening-balance' && (
        <InventoryOpeningBalancePage
          currentTenant={currentTenant}
          onNavigateToStock={() => setActiveTab('inv-items')}
          onNavigateToReports={() => setActiveTab('inv-reports')}
        />
      )}
      {activeTab === 'om-po' && (
        <PurchaseOrdersPage
          currentTenant={currentTenant}
          onNavigateToGr={(poId) => {
            setSelectedPoIdForGr(poId);
            setActiveTab('om-gr');
          }}
          onNavigateToBill={() => setActiveTab('ap-bills')}
        />
      )}
      {activeTab === 'om-gr' && (
        <GoodsReceiptsPage
          currentTenant={currentTenant}
          initialPoId={selectedPoIdForGr}
          onNavigateToBill={() => setActiveTab('ap-bills')}
        />
      )}
      {activeTab === 'om-so' && (
        <SalesOrdersPage
          currentTenant={currentTenant}
          onNavigateToDo={(soId) => {
            setSelectedSoIdForDo(soId);
            setActiveTab('om-do');
          }}
          onNavigateToInvoice={() => setActiveTab('ar-invoices')}
        />
      )}
      {activeTab === 'om-do' && (
        <DeliveryOrdersPage
          currentTenant={currentTenant}
          initialSoId={selectedSoIdForDo}
          onNavigateToInvoice={() => setActiveTab('ar-invoices')}
        />
      )}
      {activeTab === 'om-reports' && <OrderReportsPage currentTenant={currentTenant} />}
    </Layout>
  );
}

export default App;
