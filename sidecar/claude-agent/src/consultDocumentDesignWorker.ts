import { parentPort, workerData } from 'node:worker_threads'
import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten'

// 仅把纯数据送入 WASM；不向客体注入 Node、文件、网络或任何宿主函数。
try {
  const { script, data } = workerData as { script: string; data: unknown }
  const engine = await getQuickJS()
  const source = `Date=undefined;Math.random=()=>{throw Error('请使用data提供的日期和确定性数据，不使用随机数')};\nJSON.stringify((function(data){"use strict";\n${script}\n})(JSON.parse(${JSON.stringify(JSON.stringify(data ?? {}))})))`
  const result = engine.evalCode(source, {
    memoryLimitBytes: 16 * 1024 * 1024,
    maxStackSizeBytes: 256 * 1024,
    shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + 1500),
  })
  if (typeof result !== 'string' || result.length > 1_000_000) throw new Error('脚本必须返回有界文档对象，最多100万字符')
  const document: unknown = JSON.parse(result)
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('脚本须返回文档对象')
  if ((document as { format?: string }).format !== 'xlsx' && result.length > 300_000) throw new Error('非Excel文档最多30万字符')
  parentPort?.postMessage({ document })
} catch (cause) {
  const message = cause && typeof cause === 'object' && 'message' in cause
    ? String(cause.message) : String(cause)
  parentPort?.postMessage({ error: `文档设计代码执行失败：${message.slice(0, 2000)}` })
}
