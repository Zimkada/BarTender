// src/routes/index.tsx
import { createBrowserRouter } from 'react-router-dom';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { RootLayout } from '../layouts/RootLayout';
import { AdminLayout } from '../layouts/AdminLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { ErrorPage } from '../pages/ErrorPage';
import { ProtectedRoute } from '../components/ProtectedRoute';

// Lazy load HomePage to reduce initial bundle (affects mobile performance)
const HomePage = lazyWithRetry(() => import('../pages/HomePage'));

// === Pages (export default) - With automatic retry on chunk load failure ===
const DashboardPage = lazyWithRetry(() => import('../pages/DashboardPage'));
const SaleDetailsPage = lazyWithRetry(() => import('../pages/SaleDetailsPage'));
const ForecastingPage = lazyWithRetry(() => import('../pages/ForecastingPage'));
const ReturnsPage = lazyWithRetry(() => import('../pages/ReturnsPage'));
const ConsignmentPage = lazyWithRetry(() => import('../pages/ConsignmentPage'));
const AdminNotificationsPage = lazyWithRetry(() => import('../pages/AdminNotificationsPage'));
const AnalyticsPage = lazyWithRetry(() => import('../pages/AnalyticsPage'));
const TeamPage = lazyWithRetry(() => import('../pages/TeamManagementPage'));
const PromotionsPage = lazyWithRetry(() => import('../pages/PromotionsPage'));

// === Composants refactorisés en pages (export default) ===
const InventoryPage = lazyWithRetry(() => import('../pages/InventoryPage'));
const AccountingPage = lazyWithRetry(() => import('../pages/AccountingPage'));
const SettingsPage = lazyWithRetry(() => import('../pages/SettingsPage'));
const ProfilePage = lazyWithRetry(() => import('../pages/ProfilePage'));

// === Composants avec named exports ===
const SalesHistoryPage = lazyWithRetry(() => import('../pages/SalesHistoryPage'));

// === Auth Components (Default Exports) ===
const LoginScreen = lazyWithRetry(() => import('../components/LoginScreen'));
const ForgotPasswordScreen = lazyWithRetry(() => import('../components/ForgotPasswordScreen'));
const ResetPasswordScreen = lazyWithRetry(() => import('../components/ResetPasswordScreen'));

// === Onboarding (Default Export) ===
const OnboardingPage = lazyWithRetry(() => import('../pages/OnboardingPage'));

// === Admin Components (Default Exports) ===
const SuperAdminPage = lazyWithRetry(() => import('../pages/SuperAdminPage'));
const BarsManagementPage = lazyWithRetry(() => import('../pages/admin/BarsManagementPage'));
const BarStatsPage = lazyWithRetry(() => import('../pages/BarStatsPage'));
const UsersManagementPage = lazyWithRetry(() => import('../pages/admin/UsersManagementPage'));
const GlobalCatalogPage = lazyWithRetry(() => import('../pages/GlobalCatalogPage'));
const AuditLogsPage = lazyWithRetry(() => import('../pages/AuditLogsPage'));
const SecurityDashboardPage = lazyWithRetry(() => import('../pages/SecurityDashboardPage'));

export const router = createBrowserRouter([
  // =====================
  // Routes Admin (SuperAdmin) - Layout séparé
  // =====================
  {
    path: '/admin',
    element: <AdminLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <SuperAdminPage /> },
      { path: 'bars', element: <BarsManagementPage /> },
      { path: 'bars/:barId', element: <BarStatsPage /> },
      { path: 'users', element: <UsersManagementPage /> },
      { path: 'catalog', element: <GlobalCatalogPage /> },
      { path: 'audit-logs', element: <AuditLogsPage /> },
      { path: 'notifications', element: <AdminNotificationsPage /> },
      { path: 'security', element: <SecurityDashboardPage /> },
    ],
  },
  
  // =====================
  // Routes Application (Bar Users) - RootLayout
  // =====================
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      {
        path: 'sales',
        children: [
          { index: true, element: <SalesHistoryPage /> },
          { path: ':saleId', element: <SaleDetailsPage /> },
        ],
      },
      {
        path: 'inventory',
        element: <ProtectedRoute permission="canViewInventory" />,
        children: [
          { index: true, element: <InventoryPage /> },
        ],
      },
      { path: 'analytics', element: <AnalyticsPage /> },
      {
        path: 'accounting',
        element: <ProtectedRoute permission="canViewAccounting" />,
        children: [
          { index: true, element: <AccountingPage /> },
        ],
      },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'profil', element: <ProfilePage /> },
      { path: 'forecasting', element: <ForecastingPage /> },
      { path: 'returns', element: <ReturnsPage /> },
      { path: 'consignments', element: <ConsignmentPage /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'promotions', element: <PromotionsPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
    ],
  },
  
  // =====================
  // Routes Auth (Public)
  // =====================
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <LoginScreen /> },
      { path: 'forgot-password', element: <ForgotPasswordScreen /> },
      { path: 'reset-password', element: <ResetPasswordScreen /> },
    ],
  },
]);
