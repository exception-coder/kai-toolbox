import { MockHttpError, registerHttp, registerSse } from '@/lib/mock/registry'
import { basename, normalizePath, pickNonConflicting } from './utils'
import type {
  DedupeResult,
  DuplicateGroup,
  FileItem,
  FlattenScan,
  MovePlanItem,
} from './types'

const KB = 1024
const MB = 1024 * KB
const GB = 1024 * MB
const HOUR = 3600 * 1000

interface SampleFile {
  rel: string
  size: number
  hash: string
  ageHours: number
}

// 一组带有 3 类重复 + 跨目录同名 + target 预占的样例数据，用于演示完整流程。
const SAMPLE_FILES: SampleFile[] = [
  { rel: 'docs/report.pdf',             size: 12 * MB,        hash: 'h-report',     ageHours: 240 },
  { rel: 'docs/report-copy.pdf',        size: 12 * MB,        hash: 'h-report',     ageHours: 120 },
  { rel: 'docs/report-final.pdf',       size: 12 * MB,        hash: 'h-report',     ageHours: 24 },
  { rel: 'docs/notes.md',               size: 24 * KB,        hash: 'h-notes-new', ageHours: 12 },
  { rel: 'photos/IMG_001.jpg',          size: 4 * MB,         hash: 'h-img1',       ageHours: 720 },
  { rel: 'photos/IMG_001 (1).jpg',      size: 4 * MB,         hash: 'h-img1',       ageHours: 240 },
  { rel: 'photos/IMG_002.jpg',          size: 5 * MB,         hash: 'h-img2',       ageHours: 700 },
  { rel: 'photos/IMG_003.jpg',          size: 3 * MB,         hash: 'h-img3',       ageHours: 680 },
  { rel: 'videos/recording.mp4',        size: 2 * GB,         hash: 'h-rec',        ageHours: 168 },
  { rel: 'videos/recording-backup.mp4', size: 2 * GB,         hash: 'h-rec',        ageHours: 24 },
  { rel: 'videos/intro.mp4',            size: 800 * MB,       hash: 'h-intro',      ageHours: 360 },
  { rel: 'archive/notes.md',            size: 18 * KB,        hash: 'h-notes-old',  ageHours: 8760 },
  { rel: 'archive/old.tar.gz',          size: 240 * MB,       hash: 'h-old',        ageHours: 17520 },
  { rel: 'readme.txt',                  size: 2 * KB,         hash: 'h-readme',     ageHours: 30 },
]

// mock 假定这些文件已存在于 target，用于演示同名冲突。
const MOCK_TARGET_EXISTING = ['readme.txt', 'overview.pdf']

interface ScanTotals {
  totalFiles: number
  totalSize: number
  duplicateGroups: number
  duplicateFiles: number
  duplicateSize: number
}

interface MockState {
  scan: FlattenScan
  files: FileItem[]
  duplicates: DuplicateGroup[]
  movePlan: MovePlanItem[] | null
  pendingTotals: ScanTotals
  scanCancel?: () => void
  moveCancel?: () => void
}

const scans = new Map<string, MockState>()

function generateId(): string {
  return 'flatten-' + Math.random().toString(36).slice(2, 10)
}

function materializeFiles(sourcePath: string): FileItem[] {
  const root = normalizePath(sourcePath)
  const now = Date.now()
  return SAMPLE_FILES.map(s => ({
    path: `${root}/${s.rel}`,
    name: basename(s.rel),
    size: s.size,
    hash: s.hash,
    modifiedAt: now - s.ageHours * HOUR,
  }))
}

function groupDuplicates(files: FileItem[]): DuplicateGroup[] {
  const byKey = new Map<string, FileItem[]>()
  for (const f of files) {
    const key = `${f.size}::${f.hash}`
    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = []
      byKey.set(key, bucket)
    }
    bucket.push(f)
  }
  const groups: DuplicateGroup[] = []
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue
    const sorted = [...bucket].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))
    groups.push({ hash: sorted[0].hash, size: sorted[0].size, files: sorted })
  }
  groups.sort((a, b) => b.size * b.files.length - a.size * a.files.length)
  return groups
}

function summarizeDuplicates(groups: DuplicateGroup[]) {
  let duplicateFiles = 0
  let duplicateSize = 0
  for (const g of groups) {
    duplicateFiles += g.files.length
    duplicateSize += (g.files.length - 1) * g.size
  }
  return { duplicateGroups: groups.length, duplicateFiles, duplicateSize }
}

function buildMovePlan(_targetPath: string, files: FileItem[]): MovePlanItem[] {
  const used = new Set<string>(MOCK_TARGET_EXISTING)
  return files.map(f => {
    const before = f.name
    const finalName = pickNonConflicting(used, before)
    return {
      sourcePath: f.path,
      sourceName: before,
      targetName: finalName,
      size: f.size,
      conflict: finalName !== before,
    }
  })
}

registerHttp('POST', '/flatten/scans', (ctx) => {
  const body = (ctx.body ?? {}) as { sourcePath?: string; targetPath?: string }
  const sourcePath = (body.sourcePath ?? '').trim()
  const targetPath = (body.targetPath ?? '').trim()
  if (!sourcePath) throw new MockHttpError(400, '源目录不能为空')
  if (!targetPath) throw new MockHttpError(400, '目标目录不能为空')
  if (normalizePath(sourcePath) === normalizePath(targetPath)) {
    throw new MockHttpError(400, '源目录与目标目录不能相同')
  }

  const id = generateId()
  const files = materializeFiles(sourcePath)
  const duplicates = groupDuplicates(files)
  const summary = summarizeDuplicates(duplicates)
  const totalSize = files.reduce((acc, f) => acc + f.size, 0)
  const scan: FlattenScan = {
    id,
    sourcePath: normalizePath(sourcePath),
    targetPath: normalizePath(targetPath),
    status: 'SCANNING',
    startedAt: Date.now(),
    finishedAt: null,
    totalFiles: 0,
    totalSize: 0,
    duplicateGroups: 0,
    duplicateFiles: 0,
    duplicateSize: 0,
    filesToMove: 0,
    movedFiles: 0,
    errorMsg: null,
  }
  scans.set(id, {
    scan,
    files,
    duplicates,
    movePlan: null,
    pendingTotals: { ...summary, totalFiles: files.length, totalSize },
  })
  return scan
})

registerSse('/flatten/scans/:id/scan-events', (ctx, emit) => {
  const id = ctx.params.id
  const state = scans.get(id)
  if (!state) {
    queueMicrotask(() => emit('error', { message: 'scan 不存在' }))
    return () => {}
  }

  if (state.scan.status !== 'SCANNING') {
    queueMicrotask(() =>
      emit('completed', {
        totalFiles: state.scan.totalFiles,
        totalSize: state.scan.totalSize,
        duplicateGroups: state.scan.duplicateGroups,
        duplicateFiles: state.scan.duplicateFiles,
        duplicateSize: state.scan.duplicateSize,
      }),
    )
    return () => {}
  }

  const pending = state.pendingTotals
  const TICK_MS = 280
  const TICKS = 7
  let tick = 0
  let cancelled = false

  const interval = window.setInterval(() => {
    if (cancelled) return
    tick += 1
    if (tick < TICKS) {
      const ratio = tick / TICKS
      const sample = state.files[tick % state.files.length]
      emit('progress', {
        scanned: Math.floor(pending.totalFiles * ratio),
        hashed: Math.floor(pending.totalFiles * Math.max(0, ratio - 0.15)),
        totalSize: Math.floor(pending.totalSize * ratio),
        currentPath: sample.path,
      })
      return
    }
    window.clearInterval(interval)
    state.scan = {
      ...state.scan,
      status: 'SCANNED',
      totalFiles: pending.totalFiles,
      totalSize: pending.totalSize,
      duplicateGroups: pending.duplicateGroups,
      duplicateFiles: pending.duplicateFiles,
      duplicateSize: pending.duplicateSize,
      filesToMove: pending.totalFiles - (pending.duplicateFiles - pending.duplicateGroups),
    }
    emit('completed', {
      totalFiles: pending.totalFiles,
      totalSize: pending.totalSize,
      duplicateGroups: pending.duplicateGroups,
      duplicateFiles: pending.duplicateFiles,
      duplicateSize: pending.duplicateSize,
    })
  }, TICK_MS)

  state.scanCancel = () => {
    cancelled = true
    window.clearInterval(interval)
  }

  return () => {
    cancelled = true
    window.clearInterval(interval)
  }
})

registerHttp('GET', '/flatten/scans/:id', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) throw new MockHttpError(404, 'scan 不存在')
  return state.scan
})

registerHttp('GET', '/flatten/scans', () =>
  Array.from(scans.values())
    .map(s => s.scan)
    .sort((a, b) => b.startedAt - a.startedAt),
)

registerHttp('GET', '/flatten/scans/:id/duplicates', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) throw new MockHttpError(404, 'scan 不存在')
  return state.duplicates
})

registerHttp('DELETE', '/flatten/scans/:id/duplicates', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) throw new MockHttpError(404, 'scan 不存在')
  if (state.scan.status !== 'SCANNED') {
    throw new MockHttpError(409, `当前状态 ${state.scan.status} 不允许删除重复`)
  }
  const body = (ctx.body ?? {}) as { keepPaths?: string[] }
  const keep = new Set(body.keepPaths ?? [])

  let deleted = 0
  let freedSize = 0
  const toDelete = new Set<string>()
  for (const g of state.duplicates) {
    const kept = g.files.find(f => keep.has(f.path)) ?? g.files[0]
    for (const f of g.files) {
      if (f.path === kept.path) continue
      toDelete.add(f.path)
      deleted += 1
      freedSize += f.size
    }
  }

  state.files = state.files.filter(f => !toDelete.has(f.path))
  state.duplicates = []
  state.scan = {
    ...state.scan,
    status: 'READY',
    duplicateGroups: 0,
    duplicateFiles: 0,
    duplicateSize: 0,
    totalSize: state.scan.totalSize - freedSize,
    totalFiles: state.scan.totalFiles - deleted,
    filesToMove: state.files.length,
  }

  const result: DedupeResult = { deleted, freedSize }
  return result
})

registerHttp('POST', '/flatten/scans/:id/skip-dedupe', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) throw new MockHttpError(404, 'scan 不存在')
  if (state.scan.status !== 'SCANNED') {
    throw new MockHttpError(409, `当前状态 ${state.scan.status} 不允许跳过`)
  }
  state.scan = {
    ...state.scan,
    status: 'READY',
    filesToMove: state.files.length,
  }
  return state.scan
})

registerHttp('GET', '/flatten/scans/:id/move-plan', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) throw new MockHttpError(404, 'scan 不存在')
  if (state.scan.status === 'SCANNING') {
    throw new MockHttpError(409, '尚在扫描中')
  }
  if (!state.movePlan) {
    state.movePlan = buildMovePlan(state.scan.targetPath, state.files)
  }
  return state.movePlan
})

registerHttp('POST', '/flatten/scans/:id/move', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) throw new MockHttpError(404, 'scan 不存在')
  if (state.scan.status !== 'READY' && state.scan.status !== 'SCANNED') {
    throw new MockHttpError(409, `当前状态 ${state.scan.status} 不允许迁移`)
  }
  if (!state.movePlan) {
    state.movePlan = buildMovePlan(state.scan.targetPath, state.files)
  }
  state.scan = { ...state.scan, status: 'MOVING', filesToMove: state.movePlan.length, movedFiles: 0 }
  return state.scan
})

registerSse('/flatten/scans/:id/move-events', (ctx, emit) => {
  const id = ctx.params.id
  const state = scans.get(id)
  if (!state) {
    queueMicrotask(() => emit('error', { message: 'scan 不存在' }))
    return () => {}
  }
  if (state.scan.status === 'COMPLETED') {
    queueMicrotask(() => emit('completed', { movedFiles: state.scan.movedFiles }))
    return () => {}
  }
  if (state.scan.status !== 'MOVING') {
    queueMicrotask(() => emit('error', { message: `当前状态 ${state.scan.status} 不在迁移中` }))
    return () => {}
  }
  const plan = state.movePlan ?? []
  const total = plan.length
  if (total === 0) {
    state.scan = { ...state.scan, status: 'COMPLETED', finishedAt: Date.now() }
    queueMicrotask(() => emit('completed', { movedFiles: 0 }))
    return () => {}
  }

  const TICK_MS = 220
  let i = 0
  let cancelled = false
  const interval = window.setInterval(() => {
    if (cancelled) return
    if (i >= total) {
      window.clearInterval(interval)
      state.scan = {
        ...state.scan,
        status: 'COMPLETED',
        finishedAt: Date.now(),
        movedFiles: total,
      }
      emit('completed', { movedFiles: total })
      return
    }
    const item = plan[i]
    i += 1
    state.scan = { ...state.scan, movedFiles: i }
    emit('progress', { moved: i, total, currentFile: item.targetName })
  }, TICK_MS)

  state.moveCancel = () => {
    cancelled = true
    window.clearInterval(interval)
  }

  return () => {
    cancelled = true
    window.clearInterval(interval)
  }
})

registerHttp('DELETE', '/flatten/scans/:id', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) return undefined
  state.scanCancel?.()
  state.moveCancel?.()
  scans.delete(ctx.params.id)
  return undefined
})
