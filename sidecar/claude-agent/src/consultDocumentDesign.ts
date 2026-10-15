import { Worker } from 'node:worker_threads'
import { existsSync } from 'node:fs'

let activeDesigns = 0

/** 模型代码只在无宿主能力的 QuickJS WASM 中执行；Worker 提供独立生命周期和硬超时。 */
export async function executeDocumentDesign(script: unknown, data: unknown): Promise<Record<string, unknown>> {
  if (typeof script !== 'string' || !script.trim() || script.length > 50_000) throw new Error('设计代码须为1–50000字符的JavaScript函数体')
  if (JSON.stringify(data ?? {}).length > 250_000) throw new Error('输入数据超过25万字符，请拆分')
  if (activeDesigns >= 2) throw new Error('文档设计正在忙，请稍后重试')
  activeDesigns++
  try {
    return await new Promise((resolve, reject) => {
      const compiledWorker = new URL('./consultDocumentDesignWorker.js', import.meta.url)
      const worker = new Worker(existsSync(compiledWorker) ? compiledWorker : new URL('./consultDocumentDesignWorker.ts', import.meta.url), {
        workerData: { script, data },
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 },
      })
      let finished = false
      const finish = (error?: Error, document?: Record<string, unknown>) => {
        if (finished) return
        finished = true
        clearTimeout(timeout)
        void worker.terminate().then(() => {
          if (error) reject(error)
          else resolve(document!)
        }, reject)
      }
      const timeout = setTimeout(() => finish(new Error('文档设计执行超时，请减少运算或拆分内容')), 5000)
      worker.once('message', value => finish(value.error ? new Error(value.error) : undefined, value.document))
      worker.once('error', error => finish(error))
      worker.once('exit', code => { if (!finished) finish(new Error(`文档设计进程退出（${code}）`)) })
    })
  } finally { activeDesigns-- }
}
