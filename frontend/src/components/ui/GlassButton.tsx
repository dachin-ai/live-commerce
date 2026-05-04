import React from 'react';
import clsx from 'clsx';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 backdrop-blur-md border outline-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-slate-900/90 text-white border-slate-700/50 hover:bg-slate-800 shadow-xl shadow-slate-900/20": variant === 'primary',
            "bg-white/50 text-slate-700 border-white/50 hover:bg-white/80 shadow-sm": variant === 'secondary',
            "bg-red-500/90 text-white border-red-400/50 hover:bg-red-600 shadow-xl shadow-red-500/20": variant === 'danger',
            "bg-transparent text-slate-700 border-slate-300/50 hover:bg-slate-50/50": variant === 'outline',
            "bg-transparent text-slate-600 border-transparent hover:bg-slate-100/50": variant === 'ghost',
            "px-3 py-1.5 text-sm": size === 'sm',
            "px-4 py-2.5 text-sm": size === 'md',
            "px-6 py-3 text-base": size === 'lg',
            "w-full": fullWidth,
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

GlassButton.displayName = 'GlassButton';
