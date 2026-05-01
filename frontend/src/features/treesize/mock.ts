import { MockHttpError, registerHttp, registerSse } from '@/lib/mock/registry'
import type { NodeView, ScanView } from './types'

const KB = 1024
const MB = 1024 * KB
const GB = 1024 * MB

interface SampleNode {
  name: string
  dir: boolean
  size?: number
  children?: SampleNode[]
}

const SAMPLE_TREE: SampleNode = {
  name: '__root__',
  dir: true,
  children: [
    {
      name: 'Videos',
      dir: true,
      children: [
        {
          name: 'tutorials',
          dir: true,
          children: [
            { name: 'react-19-deep-dive.mp4', dir: false, size: Math.floor(4.2 * GB) },
            { name: 'tailwind-v4-tour.mp4', dir: false, size: Math.floor(2.8 * GB) },
            { name: 'sqlite-internals.mp4', dir: false, size: Math.floor(1.5 * GB) },
          ],
        },
        {
          name: 'recordings',
          dir: true,
          children: [
            { name: '2025-04-team-sync.mkv', dir: false, size: Math.floor(5.6 * GB) },
            { name: '2025-04-arch-review.mkv', dir: false, size: Math.floor(3.4 * GB) },
            { name: '2025-03-demos.mkv', dir: false, size: Math.floor(4.1 * GB) },
          ],
        },
        { name: 'intro.mp4', dir: false, size: Math.floor(7.1 * GB) },
      ],
    },
    {
      name: 'Downloads',
      dir: true,
      children: [
        {
          name: 'installers',
          dir: true,
          children: [
            { name: 'jdk-21-windows.zip', dir: false, size: 320 * MB },
            { name: 'node-v22-x64.msi', dir: false, size: 65 * MB },
            { name: 'idea-2025.1.exe', dir: false, size: 980 * MB },
            { name: 'docker-desktop.exe', dir: false, size: Math.floor(1.1 * GB) },
          ],
        },
        {
          name: 'videos',
          dir: true,
          children: [
            { name: 'conference-2024.mp4', dir: false, size: Math.floor(6.4 * GB) },
            { name: 'workshop-recording.mp4', dir: false, size: Math.floor(3.6 * GB) },
          ],
        },
        {
          name: 'misc',
          dir: true,
          children: [
            { name: 'paper-draft.pdf', dir: false, size: 8 * MB },
            { name: 'wallpaper-pack.zip', dir: false, size: Math.floor(1.2 * GB) },
          ],
        },
        { name: 'readme.txt', dir: false, size: 1 * KB },
      ],
    },
    {
      name: 'Pictures',
      dir: true,
      children: [
        {
          name: '2024',
          dir: true,
          children: [
            { name: 'IMG_0001.jpg', dir: false, size: Math.floor(4.2 * MB) },
            { name: 'IMG_0002.jpg', dir: false, size: Math.floor(4.5 * MB) },
            { name: 'IMG_0003.jpg', dir: false, size: Math.floor(3.8 * MB) },
            { name: 'album.tar', dir: false, size: Math.floor(8.4 * GB) },
          ],
        },
        {
          name: '2025',
          dir: true,
          children: [
            { name: 'travel.tar', dir: false, size: Math.floor(6.2 * GB) },
            { name: 'family.tar', dir: false, size: Math.floor(4.1 * GB) },
          ],
        },
        {
          name: 'screenshots',
          dir: true,
          children: [
            { name: 'screen-2025-04-12.png', dir: false, size: 850 * KB },
            { name: 'screen-2025-04-15.png', dir: false, size: 920 * KB },
            { name: 'archive.zip', dir: false, size: Math.floor(1.1 * GB) },
          ],
        },
      ],
    },
    {
      name: 'Documents',
      dir: true,
      children: [
        {
          name: 'Projects',
          dir: true,
          children: [
            {
              name: 'kai-toolbox',
              dir: true,
              children: [
                { name: 'node_modules.tar', dir: false, size: 380 * MB },
                { name: 'src.zip', dir: false, size: Math.floor(2.4 * MB) },
                { name: 'README.md', dir: false, size: 920 },
              ],
            },
            {
              name: 'kpay-pos',
              dir: true,
              children: [
                { name: 'build-cache.tar', dir: false, size: Math.floor(1.8 * GB) },
                { name: 'logs.zip', dir: false, size: 540 * MB },
                { name: 'src.zip', dir: false, size: 12 * MB },
              ],
            },
            {
              name: 'archived',
              dir: true,
              children: [
                { name: 'old-project-2023.tar.gz', dir: false, size: Math.floor(2.4 * GB) },
                { name: 'experiment.zip', dir: false, size: Math.floor(1.6 * GB) },
              ],
            },
          ],
        },
        {
          name: 'reports',
          dir: true,
          children: [
            { name: 'q1-2025.pdf', dir: false, size: 12 * MB },
            {
              name: 'datasets',
              dir: true,
              children: [
                { name: 'sales-2024.csv', dir: false, size: 240 * MB },
                { name: 'logs-2024.csv', dir: false, size: Math.floor(1.4 * GB) },
              ],
            },
          ],
        },
        { name: 'notes.md', dir: false, size: 24 * KB },
      ],
    },
    {
      name: 'AppData',
      dir: true,
      children: [
        {
          name: 'Local',
          dir: true,
          children: [
            { name: 'browser-cache.bin', dir: false, size: Math.floor(4.6 * GB) },
            {
              name: 'docker',
              dir: true,
              children: [
                { name: 'wsl-disk.vhdx', dir: false, size: Math.floor(8.2 * GB) },
              ],
            },
          ],
        },
        {
          name: 'Roaming',
          dir: true,
          children: [
            { name: 'JetBrains-cache.zip', dir: false, size: Math.floor(2.4 * GB) },
            { name: 'config.json', dir: false, size: 3 * KB },
          ],
        },
      ],
    },
    {
      name: 'Desktop',
      dir: true,
      children: [
        { name: 'shortcut.lnk', dir: false, size: 2 * KB },
        { name: 'memo.txt', dir: false, size: 8 * KB },
      ],
    },
  ],
}

interface MaterializedNode {
  parentPath: string | null
  node: NodeView
}

interface Materialized {
  nodes: MaterializedNode[]
  totalFiles: number
  totalDirs: number
  totalSize: number
  /** Sample paths to feed back into progress events for a more lifelike UI. */
  sampleProgressPaths: string[]
}

function normalizeRoot(rootPath: string): string {
  let p = rootPath.trim().replace(/\\/g, '/')
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

function materialize(rootPath: string): Materialized {
  const root = normalizeRoot(rootPath)
  const nodes: MaterializedNode[] = []
  const sampleProgressPaths: string[] = []

  function walk(
    sample: SampleNode,
    nodePath: string,
    parentPath: string | null,
    depth: number,
  ): { size: number; fileCount: number; dirCount: number } {
    if (!sample.dir) {
      nodes.push({
        parentPath,
        node: {
          path: nodePath,
          name: sample.name,
          dir: false,
          size: sample.size ?? 0,
          fileCount: 0,
          dirCount: 0,
          depth,
        },
      })
      return { size: sample.size ?? 0, fileCount: 1, dirCount: 0 }
    }

    let size = 0
    let fileCount = 0
    let dirCount = 0
    for (const child of sample.children ?? []) {
      const childPath = `${nodePath}/${child.name}`
      const r = walk(child, childPath, nodePath, depth + 1)
      size += r.size
      fileCount += r.fileCount
      dirCount += r.dirCount
    }
    if (sample.dir && sample.children && sample.children.length > 0) {
      sampleProgressPaths.push(nodePath)
    }
    nodes.push({
      parentPath,
      node: {
        path: nodePath,
        name: parentPath === null ? root : sample.name,
        dir: true,
        size,
        fileCount,
        dirCount,
        depth,
      },
    })
    // Self counts as a directory once aggregated upward.
    return { size, fileCount, dirCount: dirCount + 1 }
  }

  const r = walk(SAMPLE_TREE, root, null, 0)
  // r.dirCount includes the root itself; expose it minus 1 so totalDirs counts
  // descendant directories only — matches what a real scanner would report.
  return {
    nodes,
    totalFiles: r.fileCount,
    totalDirs: Math.max(0, r.dirCount - 1),
    totalSize: r.size,
    sampleProgressPaths,
  }
}

interface MockScanState {
  scan: ScanView
  totals: Materialized
  cancel?: () => void
}

const scans = new Map<string, MockScanState>()

function generateId(): string {
  return 'mock-' + Math.random().toString(36).slice(2, 10)
}

registerHttp('POST', '/treesize/scans', (ctx) => {
  const body = (ctx.body ?? {}) as { path?: string }
  const path = (body.path ?? '').trim()
  if (!path) throw new MockHttpError(400, '路径不能为空')

  const id = generateId()
  const materialized = materialize(path)
  const scan: ScanView = {
    id,
    rootPath: normalizeRoot(path),
    status: 'RUNNING',
    startedAt: Date.now(),
    finishedAt: null,
    totalFiles: 0,
    totalDirs: 0,
    totalSize: 0,
    errorMsg: null,
  }

  scans.set(id, { scan, totals: materialized })
  return scan
})

registerSse('/treesize/scans/:id/events', (ctx, emit) => {
  const id = ctx.params.id
  const state = scans.get(id)
  if (!state) {
    queueMicrotask(() => emit('error', { message: 'scan 不存在' }))
    return () => {}
  }

  // Already finished: replay completion immediately.
  if (state.scan.status === 'COMPLETED') {
    queueMicrotask(() =>
      emit('completed', {
        totalFiles: state.scan.totalFiles,
        totalDirs: state.scan.totalDirs,
        totalSize: state.scan.totalSize,
      }),
    )
    return () => {}
  }
  if (state.scan.status === 'CANCELLED') {
    queueMicrotask(() => emit('cancelled', {}))
    return () => {}
  }
  if (state.scan.status === 'FAILED') {
    queueMicrotask(() => emit('error', { message: state.scan.errorMsg ?? '扫描失败' }))
    return () => {}
  }

  const totals = state.totals

  const TICK_MS = 320
  const TICKS = 8
  let tick = 0
  let cancelled = false

  const interval = window.setInterval(() => {
    if (cancelled) return
    tick += 1
    if (tick < TICKS) {
      const ratio = tick / TICKS
      const sample = totals.sampleProgressPaths
      const currentPath = sample.length > 0 ? sample[tick % sample.length] : state.scan.rootPath
      emit('progress', {
        scanned: Math.floor(totals.totalFiles * ratio),
        totalSize: Math.floor(totals.totalSize * ratio),
        currentPath,
      })
      return
    }
    window.clearInterval(interval)
    state.scan = {
      ...state.scan,
      status: 'COMPLETED',
      finishedAt: Date.now(),
      totalFiles: totals.totalFiles,
      totalDirs: totals.totalDirs,
      totalSize: totals.totalSize,
    }
    emit('completed', {
      totalFiles: totals.totalFiles,
      totalDirs: totals.totalDirs,
      totalSize: totals.totalSize,
    })
  }, TICK_MS)

  state.cancel = () => {
    if (state.scan.status !== 'RUNNING') return
    cancelled = true
    window.clearInterval(interval)
    state.scan = { ...state.scan, status: 'CANCELLED', finishedAt: Date.now() }
    emit('cancelled', {})
  }

  return () => {
    cancelled = true
    window.clearInterval(interval)
  }
})

registerHttp('GET', '/treesize/scans/:id', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) throw new MockHttpError(404, 'scan 不存在')
  return state.scan
})

registerHttp('GET', '/treesize/scans', () => {
  return Array.from(scans.values())
    .map(s => s.scan)
    .sort((a, b) => b.startedAt - a.startedAt)
})

registerHttp('GET', '/treesize/scans/:id/children', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) throw new MockHttpError(404, 'scan 不存在')
  if (state.scan.status === 'RUNNING') return []
  const path = ctx.query.get('path') ?? state.scan.rootPath
  return state.totals.nodes
    .filter(n => n.parentPath === path)
    .map(n => n.node)
    .sort((a, b) => b.size - a.size)
})

registerHttp('DELETE', '/treesize/scans/:id', (ctx) => {
  const state = scans.get(ctx.params.id)
  if (!state) return undefined
  state.cancel?.()
  scans.delete(ctx.params.id)
  return undefined
})
