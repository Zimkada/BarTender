import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react'; // Common alert icons
import { motion, AnimatePresence } from 'framer-motion'; // For animation

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground', // neutral, if needed
        destructive:
          'border-red-500/50 text-red-800 dark:border-red-500 [&>svg]:text-red-500 bg-red-50',
        warning:
          'border-amber-500/50 text-amber-800 dark:border-amber-500 [&>svg]:text-amber-500 bg-amber-50',
        success:
          'border-green-500/50 text-green-800 dark:border-green-500 [&>svg]:text-green-500 bg-green-50',
        info:
          'border-blue-500/50 text-blue-800 dark:border-blue-500 [&>svg]:text-blue-500 bg-blue-50',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface AlertIconProps extends React.SVGProps<SVGSVGElement> {
    variant: AlertProps['variant'];
}

const AlertIcon: React.FC<AlertIconProps> = ({ variant, ...props }) => {
    switch (variant) {
        case 'destructive':
            return <XCircle {...props} />;
        case 'warning':
            return <AlertCircle {...props} />;
        case 'success':
            return <CheckCircle {...props} />;
        case 'info':
            return <Info {...props} />;
        default:
            return <Info {...props} />;
    }
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
    title?: string; // Optional title for the alert
    icon?: React.ReactNode; // Optional custom icon
    show?: boolean; // For animation (if wrapped in AnimatePresence)
}

const Alert = React.forwardRef<
  HTMLDivElement,
  AlertProps
>(({ className, variant = 'default', title, icon, show = true, children, ...props }, ref) => (
  <AnimatePresence>
    {show && ( // Only animate if 'show' is true
      <motion.div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        {...props}
      >
        {icon || <AlertIcon variant={variant} className="h-4 w-4" />} {/* Render default or custom icon */}
        <div className='flex flex-col'>
            {title && <h4 className="font-semibold leading-none tracking-tight">{title}</h4>}
            <div className="text-sm [&_p]:leading-relaxed">{children}</div> {/* Description goes here */}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
));
Alert.displayName = 'Alert';

export { Alert };
