export function textFile(name: string, content = '# 测试文档', bytes?: Uint8Array): File {
  const data = bytes ?? new TextEncoder().encode(content)
  const file = new File([data as BlobPart], name, { type: 'text/plain' })
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(data.buffer), configurable: true })
  return file
}

export function deferredFile(name: string) {
  let resolve!: (value: ArrayBuffer) => void
  const file = new File(['pending'], name)
  Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(done => { resolve = done }) })
  return { file, finish: (content: string) => resolve(new TextEncoder().encode(content).buffer) }
}
