// src/layouts/AdminLayout.tsx
import { Link, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Suspense, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoadingFallback } from '../components/LoadingFallback';
import {
  LayoutDashboard,
  Building2,
  Users,
  Package,
  FileText,
  Bell,
  LogOut,
  Menu,
  X,
  ShieldCheck
} from 'lucide-react';

const adminNavItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/admin/bars', label: 'Gestion des Bars', icon: Building2 },
  { path: '/admin/users', label: 'Utilisateurs', icon: Users },
  { path: '/admin/catalog', label: 'Catalogue Global', icon: Package },
  { path: '/admin/audit-logs', label: 'Audit Logs', icon: FileText },
  { path: '/admin/notifications', label: 'Notifications', icon: Bell },
];

function AdminLayoutContent() {
  const { isAuthenticated, currentSession, logout } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isActiveRoute = (path: string, exact?: boolean) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  // Redirection vers login si non authentifié
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  // Redirection vers RootLayout si ce n'est pas un super_admin
  if (currentSession && currentSession.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }



  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile Header - Hamburger LEFT + Title RIGHT */}
      <header className="lg:hidden bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 flex items-center justify-between">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
        >
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="flex items-center gap-3 flex-1 justify-end">
          <ShieldCheck className="w-6 h-6" />
          <span className="font-bold">Admin Panel</span>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50
            w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
            lg:transform-none
            flex flex-col h-screen
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          {/* Desktop Header + Mobile Sidebar Header */}
          <div className="flex items-center gap-3 p-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
            <ShieldCheck className="w-8 h-8" />
            <div>
              <h1 className="font-bold text-lg">🍺 BarTender Pro Administration</h1>
              <p className="text-purple-200 text-sm hidden lg:block">Administration</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1 mt-16 lg:mt-0 flex-1 overflow-y-auto">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActiveRoute(item.path, item.exact);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                    ${isActive
                      ? 'bg-purple-100 text-purple-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Info & Logout */}
          <div className="p-4 border-t bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {currentSession?.userName || 'Super Admin'}
                </p>
                <p className="text-xs text-gray-500">Super Administrateur</p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-8 min-h-screen">
          <Suspense fallback={<LoadingFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export function AdminLayout() {
  return <AdminLayoutContent />;
}
