import React from 'react';

interface ChartTooltipShellProps {
  title?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartTooltipShell({ title, children }: ChartTooltipShellProps) {
  return (
    <div className="bg-popover/95 backdrop-blur-md p-3 rounded-xl border border-border shadow-[0_12px_30px_rgba(0,0,0,0.22)] min-w-[160px]">
      {title && (
        <p className="text-xs font-bold text-popover-foreground mb-2 leading-tight">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: React.ReactNode;
  valueFormatter?: (value: number, entry?: any) => React.ReactNode;
  nameFormatter?: (entry: any) => React.ReactNode;
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = (value) => value.toLocaleString('fr-FR'),
  nameFormatter = (entry) => entry.name || entry.dataKey,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <ChartTooltipShell title={label}>
      <div className="space-y-1.5">
        {payload.map((entry, index) => {
          let rawValue = entry.value;
          if (Array.isArray(rawValue)) {
            rawValue = rawValue[1] - rawValue[0];
          }
          if (rawValue === undefined || rawValue === null) {
            rawValue = entry.payload?.[entry.dataKey];
          }
          const value = Number(rawValue) || 0;

          return (
            <div key={`${entry.dataKey || entry.name || 'metric'}-${index}`} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color || entry.fill || 'var(--brand-primary)' }}
              />
              <span className="text-xs text-muted-foreground">{nameFormatter(entry)}:</span>
              <span className="text-sm font-bold text-brand-primary tabular-nums">
                {valueFormatter(value, entry)}
              </span>
            </div>
          );
        })}
      </div>
    </ChartTooltipShell>
  );
}
