import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const selectVariants = cva(
  'flex w-full appearance-none rounded-md border bg-white text-sm transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 pr-10',
  {
    variants: {
      variant: {
        default: 'border-gray-300 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/20',
        error: 'border-red-500 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/20',
        success: 'border-green-500 focus-visible:border-green-500 focus-visible:ring-2 focus-visible:ring-green-500/20',
      },
      size: {
        default: 'h-10 px-3 py-2',
        sm: 'h-9 px-2.5 py-1.5 text-xs',
        lg: 'h-11 px-4 py-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {
  options: SelectOption[];
  error?: string;
  helperText?: string;
  label?: string;
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      variant,
      size,
      options,
      error,
      helperText,
      label,
      placeholder,
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id || React.useId();
    const errorId = `${selectId}-error`;
    const helperTextId = `${selectId}-helper`;

    const hasError = !!error;
    const effectiveVariant = hasError ? 'error' : variant;

    const select = (
      <div className="relative">
        <select
          id={selectId}
          ref={ref}
          className={cn(selectVariants({ variant: effectiveVariant, size, className }))}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? errorId : helperText ? helperTextId : undefined
          }
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
          <ChevronDown size={18} />
        </div>
      </div>
    );

    if (!label && !error && !helperText) {
      return select;
    }

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-gray-700 block"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        {select}
        {error && (
          <p id={errorId} className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperTextId} className="text-sm text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select, selectVariants };
