import React from 'react';
import clsx from 'clsx';

export interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, error, icon, ...props }, ref) => {
    return (
      <div className="w-full relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={clsx(
            "w-full bg-white/40 backdrop-blur-md border transition-all duration-200 rounded-xl focus:outline-none placeholder:text-slate-400/70 text-slate-800",
            icon ? "pl-11 pr-4 py-2.5" : "px-4 py-2.5",
            error 
              ? "border-red-400 focus:ring-4 focus:ring-red-400/20 focus:border-red-500" 
              : "border-white/60 focus:border-primary-400 focus:ring-4 focus:ring-primary-500/20 hover:bg-white/60",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-red-500 px-1">{error}</p>}
      </div>
    );
  }
);

GlassInput.displayName = 'GlassInput';
