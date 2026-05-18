import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkerReq, WorkerRes } from './json-worker'
import { jsonEscape, jsonFormat, jsonMinify, jsonUnescape } from './json'

type PendingMap = Map<number, (res: WorkerRes) => void>

/** 同步 fallback：worker 创建失败时直接在主线程算。语义对齐 json-worker.ts。 */
function runSync(req: WorkerReq): WorkerRes {
  try {
    switch (req.op) {
      case 'format':
        return { id: req.id, ok: true, output: jsonFormat(req.input, req.indent) }
      case 'minify':
        return { id: req.id, ok: true, output: jsonMinify(req.input) }
      case 'escape':
        return { id: req.id, ok: true, output: jsonEscape(req.input) }
      case 'unescape':
        return { id: req.id, ok: true, output: jsonUnescape(req.input) }
      case 'parse':
        return { id: req.id, ok: true, root: req.input.trim() ? JSON.parse(req.input) : null }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { id: req.id, ok: false, error: msg }
  }
}

export function useJsonWorker() {
  const workerRef = useRef<Worker | null>(null)
  const fallbackRef = useRef(false)
  const pendingRef = useRef<PendingMap>(new Map())
  const idRef = useRef(0)
  const [busy, setBusy] = useState(false)
  const inflightRef = useRef(0)

  const ensureWorker = useCallback((): Worker | null => {
    if (fallbackRef.current) return null
    if (workerRef.current) return workerRef.current
    try {
      const w = new Worker(new URL('./json-worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (ev: MessageEvent<WorkerRes>) => {
        const cb = pendingRef.current.get(ev.data.id)
        if (!cb) return
        pendingRef.current.delete(ev.data.id)
        cb(ev.data)
      }
      w.onerror = () => {
        // 整个 worker 挂了：把剩余 pending 全部 reject 成错误，落回 sync
        for (const [id, cb] of pendingRef.current) {
          cb({ id, ok: false, error: 'worker 异常，已回退到同步实现' })
        }
        pendingRef.current.clear()
        fallbackRef.current = true
        workerRef.current?.terminate()
        workerRef.current = null
      }
      workerRef.current = w
      return w
    } catch {
      fallbackRef.current = true
      return null
    }
  }, [])

  useEffect(() => {
    return () => {
      // 卸载时把没回来的 pending 兜底 resolve，防止调用方 Promise 悬挂
      for (const [id, cb] of pendingRef.current) {
        cb({ id, ok: false, error: '组件已卸载' })
      }
      pendingRef.current.clear()
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const run = useCallback(
    (partial: Omit<WorkerReq, 'id'>): Promise<WorkerRes> => {
      const id = ++idRef.current
      const req = { ...partial, id } as WorkerReq

      inflightRef.current += 1
      setBusy(true)

      const finish = (res: WorkerRes): WorkerRes => {
        inflightRef.current = Math.max(0, inflightRef.current - 1)
        if (inflightRef.current === 0) setBusy(false)
        return res
      }

      const w = ensureWorker()
      if (!w) {
        // 同步 fallback；用 microtask 保证返回 Promise 风格一致
        return Promise.resolve().then(() => finish(runSync(req)))
      }

      return new Promise<WorkerRes>(resolve => {
        pendingRef.current.set(id, res => resolve(finish(res)))
        w.postMessage(req)
      })
    },
    [ensureWorker],
  )

  return { run, busy }
}
