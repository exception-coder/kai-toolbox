import type { AssistantLoader, LoadedAssistantSdk } from '../assistant-loader/loader'

const LOADER_SCRIPT_PATH = '/assistant-sdk/loader.js'
const LOADER_SCRIPT_SELECTOR = 'script[data-kai-assistant-loader]'

let loaderReady: Promise<AssistantLoader> | undefined

/** 加载固定 Loader，并通过 stable 渠道解析当前 Assistant 运行时。 */
export async function loadStableAssistantRuntime(): Promise<LoadedAssistantSdk> {
  const loader = await ensureAssistantLoader()
  return loader.load({ channel: 'stable' })
}

export function ensureAssistantLoader(): Promise<AssistantLoader> {
  if (window.KaiAssistantLoader) return Promise.resolve(window.KaiAssistantLoader)
  if (loaderReady) return loaderReady

  loaderReady = new Promise<AssistantLoader>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(LOADER_SCRIPT_SELECTOR)
    const script = existing ?? document.createElement('script')
    const finish = () => {
      if (window.KaiAssistantLoader) {
        resolve(window.KaiAssistantLoader)
        return
      }
      loaderReady = undefined
      reject(new Error('KAI Assistant Loader 已加载，但没有注册运行时'))
    }
    const fail = () => {
      loaderReady = undefined
      reject(new Error('KAI Assistant Loader 加载失败'))
    }

    script.addEventListener('load', finish, { once: true })
    script.addEventListener('error', fail, { once: true })
    if (!existing) {
      script.src = LOADER_SCRIPT_PATH
      script.async = true
      script.dataset.kaiAssistantLoader = 'true'
      document.head.append(script)
    }
  })
  return loaderReady
}

export function resetAssistantLoaderForTest(): void {
  loaderReady = undefined
}
