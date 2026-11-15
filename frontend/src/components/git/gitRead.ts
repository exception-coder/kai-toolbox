/** Bound read-only UI waits. Late responses are discarded by each caller's generation guard. */
export async function gitRead<T>(request: Promise<T>, timeoutMs = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('读取超时，请重试；不会自动执行 Git 写操作。')), timeoutMs)
    })])
  } finally { clearTimeout(timer) }
}
