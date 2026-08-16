import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface FieldShellProps {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}

export function FieldShell({ label, htmlFor, required, hint, error, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
      {error && <p role="alert" className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  )
}
export interface H5InputProps extends InputHTMLAttributes<HTMLInputElement> {
  prefixNode?: ReactNode
  suffix?: string
  hasError?: boolean
}

export function H5Input({ className, prefixNode, suffix, hasError, ...props }: H5InputProps) {
  if (prefixNode || suffix) {
    return (
      <div
        className={cn(
          'flex h-10 w-full items-center rounded-lg border bg-white px-3 text-sm text-slate-900 transition-colors',
          hasError
            ? 'border-rose-300 focus-within:border-rose-600 focus-within:ring-1 focus-within:ring-rose-600/30'
            : 'border-slate-200/90 hover:border-slate-300 focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900',
          props.disabled && 'cursor-not-allowed bg-slate-50 text-slate-400 hover:border-slate-200/90',
        )}
      >
        {prefixNode && <span className="mr-1.5 shrink-0 text-xs font-medium text-slate-400">{prefixNode}</span>}
        <input
          className={cn(
            'w-full min-w-0 bg-transparent text-sm tabular-nums text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {suffix && <span className="ml-1.5 shrink-0 text-xs font-normal text-slate-400">{suffix}</span>}
      </div>
    )
  }

  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border bg-white px-3 text-sm tabular-nums text-slate-900 outline-none transition-colors',
        hasError
          ? 'border-rose-300 focus:border-rose-600 focus:ring-1 focus:ring-rose-600/30'
          : 'border-slate-200/90 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900',
        'placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
        className,
      )}
      {...props}
    />
  )
}
export function H5Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full resize-y rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors',
        'hover:border-slate-300 placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
        className,
      )}
      {...props}
    />
  )
}
