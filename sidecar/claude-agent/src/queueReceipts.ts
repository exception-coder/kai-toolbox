import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface QueueReceipt {
  sessionId: string
  turnId: string
  state: 'RECEIVED' | 'COMPLETED'
  observedAt: number
  stopReason?: string
  queueReleaseSafe?: boolean
  queueCheckOutcome?: 'COMPLETED' | 'UNCONFIRMED'
}

/** 接收先落盘、执行后落终态。仅存轮次元数据；未知结果不能作为可重放证据。 */
export class QueueReceipts {
  private data: { storeId: string; receipts: QueueReceipt[] }
  constructor(private readonly file: string, private readonly capacity = 2048) {
    if (existsSync(file)) {
      const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (!data || typeof data !== 'object' || !('storeId' in data) || typeof data.storeId !== 'string'
        || !('receipts' in data) || !Array.isArray(data.receipts)
        || data.receipts.some(r => !r || typeof r.sessionId !== 'string' || typeof r.turnId !== 'string'
          || !['RECEIVED', 'COMPLETED'].includes(r.state) || !Number.isFinite(r.observedAt))) {
        throw new Error('队列回执文件损坏，拒绝忽略旧接收记录')
      }
      this.data = data as typeof this.data
    } else {
      this.data = { storeId: randomUUID(), receipts: [] }
      this.persist(this.data)
    }
  }
  get storeId(): string { return this.data.storeId }
  find(sessionId: string, turnId?: string): QueueReceipt | undefined {
    return this.data.receipts.find(r => r.sessionId === sessionId && r.turnId === turnId)
  }
  receive(sessionId: string, turnId: string): QueueReceipt {
    const existing = this.find(sessionId, turnId)
    if (existing) return existing
    const receipt: QueueReceipt = { sessionId, turnId, state: 'RECEIVED', observedAt: Date.now() }
    this.save(receipt)
    return receipt
  }
  complete(sessionId: string, event: Record<string, unknown>): void {
    const turnId = typeof event.turnId === 'string' ? event.turnId : undefined
    const existing = this.find(sessionId, turnId)
    if (!existing || existing.state === 'COMPLETED') return
    this.save({ ...existing, state: 'COMPLETED', observedAt: Date.now(),
      stopReason: typeof event.stopReason === 'string' ? event.stopReason : 'error',
      queueCheckOutcome: event.queueCheckOutcome === 'COMPLETED' ? 'COMPLETED' : event.queueCheckOutcome === 'UNCONFIRMED' ? 'UNCONFIRMED' : undefined,
      queueReleaseSafe: ['end_turn', 'success', 'completed', 'stop'].includes(String(event.stopReason))
        && event.queueReleaseSafe !== false })
  }
  private save(receipt: QueueReceipt): void {
    const receipts = this.data.receipts.filter(r => !(r.sessionId === receipt.sessionId && r.turnId === receipt.turnId))
    receipts.push(receipt)
    let pruned = false
    while (receipts.length > this.capacity) {
      const oldest = receipts.findIndex(r => r.state === 'COMPLETED')
      if (oldest < 0) throw new Error('未收口队列回执过多，停止接收新任务')
      receipts.splice(oldest, 1)
      pruned = true
    }
    // 删除回执后更换证据代际；旧代际的“查无记录”不能证明从未接收，禁止据此重投。
    const data = { storeId: pruned ? randomUUID() : this.storeId, receipts }
    this.persist(data)
    this.data = data
  }
  private persist(data: typeof this.data): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    const handle = openSync(temporary, 'w', 0o600)
    try { writeFileSync(handle, JSON.stringify(data), 'utf8'); fsyncSync(handle) }
    finally { closeSync(handle) }
    renameSync(temporary, this.file)
  }
}

/** 只接受本次追问最后一行的明确结论，正文引用或旧轮次标记不能误放行。 */
export function queueCheckOutcome(text: string, turnId: string): 'COMPLETED' | 'UNCONFIRMED' {
  return text.trim().split(/\r?\n/).at(-1) === `FORGE_QUEUE_COMPLETED:${turnId}` ? 'COMPLETED' : 'UNCONFIRMED'
}
