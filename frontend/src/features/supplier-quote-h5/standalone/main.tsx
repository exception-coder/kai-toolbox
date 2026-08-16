import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { SupplierQuoteApp } from '../SupplierQuoteApp'
import { createHttpSupplierQuoteGateway } from '../api/httpGateway'
import { createMockSupplierQuoteGateway } from '../api/mockGateway'
import './standalone.css'

interface RuntimeConfig {
  mode: 'mock' | 'http'
  apiBaseUrl: string
  brandName: string
}

void start()

async function start() {
  const root = createRoot(document.getElementById('root')!)
  try {
    const config = await loadRuntimeConfig()
    const gateway = config.mode === 'http'
      ? createHttpSupplierQuoteGateway({ apiBaseUrl: config.apiBaseUrl })
      : createMockSupplierQuoteGateway()
    root.render(
      <StrictMode>
        <BrowserRouter>
          <ConfirmProvider>
            <SupplierQuoteApp gateway={gateway} brandName={config.brandName} demo={config.mode === 'mock'} />
          </ConfirmProvider>
        </BrowserRouter>
      </StrictMode>,
    )
  } catch (error) {
    root.render(<RuntimeConfigurationError message={error instanceof Error ? error.message : String(error)} />)
  }
}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch('/runtime-config.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('缺少 runtime-config.json，无法确定报价服务地址')
  const config = await response.json() as Partial<RuntimeConfig>
  if (config.mode !== 'mock' && config.mode !== 'http') throw new Error('runtime-config.json.mode 必须是 mock 或 http')
  if (config.mode === 'http' && !config.apiBaseUrl?.trim()) throw new Error('HTTP 模式必须配置 apiBaseUrl')
  return { mode: config.mode, apiBaseUrl: config.apiBaseUrl?.trim() ?? '', brandName: config.brandName?.trim() || '织联协同' }
}

function RuntimeConfigurationError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
      <section className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-7 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Configuration error</p>
        <h1 className="mt-3 text-2xl font-black">H5 运行配置无效</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        <p className="mt-5 rounded-xl bg-slate-100 p-3 font-mono text-xs text-slate-600">请检查站点根目录的 runtime-config.json</p>
      </section>
    </main>
  )
}
