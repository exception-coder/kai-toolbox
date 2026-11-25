/** Bound the whole read, including authentication and response decoding. */
export async function localDocumentRequest<T>(read: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel: () => void = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      const reason = signal?.reason ?? new DOMException('读取已取消', 'AbortError')
      reject(reason)
      controller.abort(reason)
    }
    if (signal?.aborted) { cancel(); return }
    signal?.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => {
      const error = new Error('文件读取超时，请检查与 Forge 的连接后重试。')
      reject(error)
      controller.abort(error)
    }, 20_000)
  })
  try {
    return await Promise.race([interrupted, controller.signal.aborted
      ? Promise.reject(controller.signal.reason) : read(controller.signal)])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
