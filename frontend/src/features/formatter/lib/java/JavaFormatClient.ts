import type { JavaFormatOptions, JavaFormatResult, JavaWorkerResponse } from './contracts'

interface Pending {
  id: number
  resolve: (result: JavaFormatResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** 一次只计算一份原文；失败或取消后重建 Worker，迟到结果按 ID 丢弃。 */
export class JavaFormatClient {
  private worker: Worker | null = null
  private pending: Pending | null = null
  private sequence = 0

  run(input: string, options: JavaFormatOptions): Promise<JavaFormatResult> {
    if (this.pending) return Promise.reject(new Error('正在格式化，请稍候。'))
    return new Promise((resolve, reject) => {
      try {
        const worker = this.ensureWorker()
        const id = ++this.sequence
        const timer = setTimeout(() => this.cancel('格式化超过 15 秒，请缩小片段后重试；原文已保留。'), 15_000)
        this.pending = { id, resolve, reject, timer }
        worker.postMessage({ id, input, options })
      } catch {
        this.cancel('浏览器格式化组件暂不可用，请重试或重新打开此页；仍可查看原文。')
        reject(new Error('浏览器格式化组件暂不可用，请重试或重新打开此页；仍可查看原文。'))
      }
    })
  }

  cancel(reason = '已取消格式化，原文已保留。') {
    const pending = this.pending
    this.pending = null
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error(reason)) }
    this.worker?.terminate()
    this.worker = null
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./java-worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<JavaWorkerResponse>) => {
      const pending = this.pending
      if (!pending || pending.id !== event.data.id) return
      if (typeof event.data.result?.ok !== 'boolean') { this.cancel('格式化结果无效，请重试。'); return }
      this.pending = null
      clearTimeout(pending.timer)
      pending.resolve(event.data.result)
    }
    worker.onerror = () => { if (this.worker === worker) this.cancel('格式化组件加载失败，请重试；原文已保留。') }
    worker.onmessageerror = () => { if (this.worker === worker) this.cancel('格式化结果无法读取，请重试；原文已保留。') }
    this.worker = worker
    return worker
  }
}
