import { formatJava } from './formatJava'
import type { JavaWorkerRequest, JavaWorkerResponse } from './contracts'

self.onmessage = async (event: MessageEvent<JavaWorkerRequest>) => {
  const { id, input, options } = event.data
  try {
    const result = await formatJava(input, options)
    self.postMessage({ id, result } satisfies JavaWorkerResponse)
  } catch {
    self.postMessage({ id, result: { ok: false, error: '格式化未完成，请重试；原文已保留。' } } satisfies JavaWorkerResponse)
  }
}
