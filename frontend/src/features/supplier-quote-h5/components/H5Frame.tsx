import type { ReactNode } from 'react'
import { Building2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface H5FrameProps {
  brandName: string
  currentStep: 1 | 2
  title: string
  description: string
  badge?: string
  children: ReactNode
  footer?: ReactNode
}

export function H5Frame({ brandName, currentStep, title, description, badge, children, footer }: H5FrameProps) {
  return (
    <div className="supplier-quote-h5 min-h-[100dvh] bg-[var(--sq-canvas)] text-[var(--sq-text)] antialiased selection:bg-slate-900 selection:text-white">
      {/* Top enterprise navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-md bg-slate-900 text-white shadow-xs">
              <Building2 aria-hidden="true" className="size-3.5" />
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold tracking-tight text-slate-900">{brandName}</span>
              <span className="hidden text-[10px] text-slate-400 sm:inline">协同平台</span>
            </div>
          </div>

          <nav aria-label="流程步骤" className="flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium transition-colors',
                currentStep === 1 ? 'font-semibold text-slate-900' : 'text-slate-500',
              )}
            >
              {currentStep > 1 ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="size-2.5 stroke-[3]" />
                </span>
              ) : (
                <span className="flex size-4 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
                  1
                </span>
              )}
              登记
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium transition-colors',
                currentStep === 2 ? 'font-semibold text-slate-900' : 'text-slate-400',
              )}
            >
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded-full text-[10px]',
                  currentStep === 2 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                2
              </span>
              报价
            </span>
          </nav>
        </div>
      </header>

      {/* Main page content */}
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
        <div className="mb-5">
          {badge && (
            <span className="mb-1.5 inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {badge}
            </span>
          )}
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">{description}</p>
        </div>

        {children}
      </main>

      {footer}
    </div>
  )
}
