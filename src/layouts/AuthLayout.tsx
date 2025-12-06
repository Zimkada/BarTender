// src/layouts/AuthLayout.tsx
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
  
export function AuthLayout() {
  const { isAuthenticated } = useAuth();
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-50">
      <Outlet />
    </div>
  );
}
