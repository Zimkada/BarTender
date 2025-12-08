import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded-2xl shadow-sm mb-6 overflow-hidden p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-lg transition-colors hover:bg-white/20"
          >
            <ArrowLeft size={24} />
          </Button>
          {icon && (
            <div className="hidden sm:flex items-center justify-center bg-white/20 p-2 rounded-lg">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
            {subtitle && (
              <p className="text-sm text-amber-100 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 self-end sm:self-auto">{actions}</div>}
      </div>
    </div>
  );
}
