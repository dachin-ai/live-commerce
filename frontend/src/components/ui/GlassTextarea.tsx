import React from 'react';
import clsx from 'clsx';

export interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const GlassTextarea = React.forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full relative flex flex-col">
        <textarea
          ref={ref}
          className={clsx(
            "w-full bg-white/40 backdrop-blur-md border transition-all duration-200 rounded-xl px-4 py-3 focus:outline-none placeholder:text-slate-400/70 text-slate-800 min-h-[120px] resize-y",
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

GlassTextarea.displayName = 'GlassTextarea';
