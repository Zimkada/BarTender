import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100/80',
        secondary: 'bg-muted text-foreground/80 hover:bg-muted/80',
        success: 'bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 hover:bg-green-100/80',
        warning: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 hover:bg-yellow-100/80',
        danger: 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 hover:bg-red-100/80',
        info: 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 hover:bg-blue-100/80',
        outline: 'border border-border text-foreground/80 hover:bg-muted',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        default: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
  dot?: boolean;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, icon, dot, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      >
        {dot && (
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
        )}
        {icon && <span className="mr-1">{icon}</span>}
        {children}
      </div>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
