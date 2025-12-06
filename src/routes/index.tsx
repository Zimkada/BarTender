// src/routes/index.tsx
import React, { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '../layouts/RootLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { ErrorPage } from '../pages/ErrorPage';
import { HomePage } from '../pages/HomePage';
import { LoadingFallback } from '../components/LoadingFallback';
import { ProtectedRoute } from '../components/ProtectedRoute';

// === Pages (export default) ===
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const SaleDetailsPage = lazy(() => import('../pages/SaleDetailsPage'));
const ForecastingPage = lazy(() => import('../pages/ForecastingPage'));
const ReturnsPage = lazy(() => import('../pages/ReturnsPage'));
const ConsignmentPage = lazy(() => import('../pages/ConsignmentPage'));
const AdminNotificationsPage = lazy(() => import('../pages/AdminNotificationsPage'));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage'));
const TeamPage = lazy(() => import('../pages/TeamPage'));
const PromotionsPage = lazy(() => import('../components/promotions/PromotionsManager'));

// === Composants refactorisés en pages (export default) ===
const InventoryPage = lazy(() => import('../components/Inventory'));
const AccountingPage = lazy(() => import('../components/Accounting'));
const SettingsPage = lazy(() => import('../components/Settings'));

// === Composants avec named exports ===
const SalesHistoryPage = lazy(() => import('../components/SalesHistory').then(m => ({ default: m.EnhancedSalesHistory })));

// === Auth Components (Named Exports) ===
const LoginScreen = lazy(() => import('../components/LoginScreen').then(m => ({ default: m.LoginScreen })));
const ForgotPasswordScreen = lazy(() => import('../components/ForgotPasswordScreen').then(m => ({ default: m.ForgotPasswordScreen })));
const ResetPasswordScreen = lazy(() => import('../components/ResetPasswordScreen').then(m => ({ default: m.ResetPasswordScreen })));

// === Admin Components (Named Exports) ===
const SuperAdminDashboardPage = lazy(() => import('../components/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
const BarsManagementPage = lazy(() => import('../components/BarsManagementPanel').then(m => ({ default: m.BarsManagementPanel })));
const BarStatsModalPage = lazy(() => import('../components/BarStatsModal').then(m => ({ default: m.BarStatsModal })));
const UsersManagementPage = lazy(() => import('../components/UsersManagementPanel').then(m => ({ default: m.UsersManagementPanel })));
const GlobalCatalogPage = lazy(() => import('../components/GlobalCatalogPanel').then(m => ({ default: m.GlobalCatalogPanel })));
const AuditLogsPage = lazy(() => import('../components/AuditLogsPanel').then(m => ({ default: m.AuditLogsPanel })));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'dashboard', element: <Suspense fallback={<LoadingFallback />}><DashboardPage /></Suspense> },
      {
        path: 'sales',
        children: [
          { index: true, element: <Suspense fallback={<LoadingFallback />}><SalesHistoryPage /></Suspense> },
          { path: ':saleId', element: <Suspense fallback={<LoadingFallback />}><SaleDetailsPage /></Suspense> },
        ],
      },
      {
        path: 'inventory',
        element: <ProtectedRoute permission="canViewInventory" />,
        children: [
          { index: true, element: <Suspense fallback={<LoadingFallback />}><InventoryPage /></Suspense> },
        ],
      },
      { path: 'analytics', element: <Suspense fallback={<LoadingFallback />}><AnalyticsPage /></Suspense> },
      {
        path: 'accounting',
        element: <ProtectedRoute permission="canViewAccounting" />,
        children: [
          { index: true, element: <Suspense fallback={<LoadingFallback />}><AccountingPage /></Suspense> },
        ],
      },
      { path: 'settings', element: <Suspense fallback={<LoadingFallback />}><SettingsPage /></Suspense> },
      { path: 'forecasting', element: <Suspense fallback={<LoadingFallback />}><ForecastingPage /></Suspense> },
      { path: 'returns', element: <Suspense fallback={<LoadingFallback />}><ReturnsPage /></Suspense> },
      { path: 'consignments', element: <Suspense fallback={<LoadingFallback />}><ConsignmentPage /></Suspense> },
      { path: 'team', element: <Suspense fallback={<LoadingFallback />}><TeamPage /></Suspense> },
      { path: 'promotions', element: <Suspense fallback={<LoadingFallback />}><PromotionsPage /></Suspense> },
      
      // Routes Admin
      {
        path: 'admin',
        element: <ProtectedRoute permission="canAccessAdminDashboard" />,
        children: [
          { index: true, element: <Suspense fallback={<LoadingFallback />}><SuperAdminDashboardPage /></Suspense> },
          { path: 'bars', element: <Suspense fallback={<LoadingFallback />}><BarsManagementPage /></Suspense> },
          { path: 'bars/:barId', element: <Suspense fallback={<LoadingFallback />}><BarStatsModalPage /></Suspense> },
          { path: 'users', element: <Suspense fallback={<LoadingFallback />}><UsersManagementPage /></Suspense> },
          { path: 'catalog', element: <Suspense fallback={<LoadingFallback />}><GlobalCatalogPage /></Suspense> },
          { path: 'audit-logs', element: <Suspense fallback={<LoadingFallback />}><AuditLogsPage /></Suspense> },
          { path: 'notifications', element: <Suspense fallback={<LoadingFallback />}><AdminNotificationsPage /></Suspense> },
        ],
      },
    ],
  },
  // Routes Auth
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <Suspense fallback={<LoadingFallback />}><LoginScreen /></Suspense> },
      { path: 'forgot-password', element: <Suspense fallback={<LoadingFallback />}><ForgotPasswordScreen /></Suspense> },
      { path: 'reset-password', element: <Suspense fallback={<LoadingFallback />}><ResetPasswordScreen /></Suspense> },
    ],
  },
]);
