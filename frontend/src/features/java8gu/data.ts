// 数据加载层：直接从 GitHub 仓库的指定子目录拉目录结构 + 单题 markdown，浏览器端
// 实时跑 analyzeMarkdown 组装索引。
//
// 配置存储：
// - 数据源配置（owner/repo/branch/dir/token）现在走通用 feature-config 入库
// - 本文件持有一个 module 级单例 currentDataSource，由 Hub 页面通过 applyDataSource() 在 hook 拿到配置后注入
// - 这样 loadIndex / loadMarkdown 内部保留同步访问，外部组件 React 层用 hook 管理
//
// 缓存策略：
// - 索引按 GitHub tree.sha 落 localStorage（仅 ~700KB）
// - cache-first：有本地索引就直接用，**不再每次进页面打 Trees API**（匿名 60 次/小时易爆）
//   只有 (a) 用户点强制刷新 forceRefresh=true 或 (b) 本地没缓存，才会去校验 sha
// - 单题 markdown 用 module 级 Map 缓存，刷新即失效（依赖浏览器 HTTP 缓存）
// - 可选 GitHub Personal Access Token：填了则带 Authorization 头，限流升到 5000 次/小时
//
// 设计文档：
// - ai-docs/kai-toolbox/design/java8gu-github数据源/java8gu-github数据源-current.md
// - ai-docs/kai-toolbox/design/feature-config-通用配置存储/feature-config-通用配置存储-current.md

import type {
  Java8guCategory,
  Java8guIndex,
  Java8guQuestion,
} from './types'
import {
  analyzeMarkdown,
  hashHue,
  pickKeywordChips,
} from './lib/analyze'

export interface DataSourceConfig {
  owner: string
  repo: string
  branch: string
  /** 仓库根下的子目录（不带前后斜杠） */
  dir: string
  /** 可选 GitHub Personal Access Token；填了把匿名 60/h 限流升到 5000/h */
  token?: string
}

export const DEFAULT_DATA_SOURCE: DataSourceConfig = {
  owner: 'exception-coder',
  repo: 'JobInterviewLog',
  branch: 'main',
  dir: 'java8gu-速记版',
  token: '',
}

/** 旧版 localStorage 键名；保留供 feature-config hook 做一次性迁移读取 */
export const LEGACY_LOCALSTORAGE_KEY = 'java8gu:source:v1'

const FETCH_CONCURRENCY = 16
// 缓存键按数据源指纹隔离，切换数据源不会复用旧索引
const cacheKeyOf = (cfg: DataSourceConfig) =>
  `java8gu:index:v1:${cfg.owner}/${cfg.repo}@${cfg.branch}:${cfg.dir}`

// module 级单例：由 React 层（HubPage）通过 applyDataSource 注入
// loadIndex / loadMarkdown 内部仍同步读取，保持原有调用签名不变
let currentDataSource: DataSourceConfig = { ...DEFAULT_DATA_SOURCE }

export function getDataSource(): DataSourceConfig {
  return currentDataSource
}

/**
 * 由 React 层在拿到最新配置后调用：
 * - 浅比较：内容一致就跳过，避免无谓清缓存
 * - 内容变化：替换单例 + 重置 runtime cache，下次 loadIndex 会按新 cfg 拉取
 *
 * 注意：不写 localStorage / API。持久化由 useFeatureConfig hook 完成。
 */
export function applyDataSource(cfg: DataSourceConfig): void {
  const normalized: DataSourceConfig = {
    owner: cfg.owner.trim(),
    repo: cfg.repo.trim(),
    branch: cfg.branch.trim(),
    dir: cfg.dir.trim().replace(/^\/+|\/+$/g, ''),
    token: cfg.token?.trim() || '',
  }
  if (sameSource(currentDataSource, normalized)) return
  currentDataSource = normalized
  resetRuntimeState()
}

function sameSource(a: DataSourceConfig, b: DataSourceConfig): boolean {
  return a.owner === b.owner
    && a.repo === b.repo
    && a.branch === b.branch
    && a.dir === b.dir
    && (a.token ?? '') === (b.token ?? '')
}

/** 切换数据源后调用，丢弃 in-memory promise / markdown / sourceFile 映射 */
export function resetRuntimeState(): void {
  indexPromise = null
  markdownCache.clear()
  sourceFileById.clear()
}

// 两种支持的目录结构：
// - 嵌套（如 JobInterviewLog/java8gu-速记版/）：{dir}/NN_类目/NNNN_题目.md
// - 平铺（如 job-interview-log/java八股文合集/速记知识图谱/）：{dir}/NN_主题.md
//   平铺模式下每个文件被当作一个 question，归在一个合成 category 下
const CATEGORY_PATTERN = /^\d{2}_/
const QUESTION_FILE_PATTERN = /^(\d{4})_(.+)\.md$/
const FLAT_FILE_PATTERN = /^(\d{2})_(.+)\.md$/
const FLAT_CATEGORY_ID = '__flat__'

export type LoadProgress = (done: number, total: number) => void

let indexPromise: Promise<Java8guIndex> | null = null
const markdownCache = new Map<string, Promise<string>>()
// id -> sourceFile（相对于仓库根的 path），用于 loadMarkdown 还原 URL
const sourceFileById = new Map<string, string>()

interface TreeEntry {
  path: string
  type: 'blob' | 'tree' | string
  sha: string
}
interface TreesResponse {
  sha: string
  tree: TreeEntry[]
  truncated?: boolean
}
interface CachedIndex {
  sha: string
  index: Java8guIndex
}

export interface LoadOptions {
  onProgress?: LoadProgress
  /** true 时跳过本地缓存、强制重新打 Trees API + 重拉全量 markdown */
  forceRefresh?: boolean
}

export function loadIndex(
  optsOrProgress?: LoadProgress | LoadOptions,
): Promise<Java8guIndex> {
  const opts: LoadOptions =
    typeof optsOrProgress === 'function'
      ? { onProgress: optsOrProgress }
      : optsOrProgress ?? {}

  // forceRefresh 时清掉 in-flight promise + 缓存映射，确保拿到全新数据
  if (opts.forceRefresh) {
    indexPromise = null
    sourceFileById.clear()
  }

  if (!indexPromise) {
    indexPromise = doLoadIndex(opts).catch(e => {
      indexPromise = null
      throw e
    })
  }
  return indexPromise
}

async function doLoadIndex(opts: LoadOptions): Promise<Java8guIndex> {
  const { onProgress, forceRefresh } = opts
  const cfg = getDataSource()

  // ── cache-first：非强制刷新场景，本地有索引就直接用，不打 Trees API ──
  if (!forceRefresh) {
    const cached = readCache(cfg)
    if (cached) {
      primeSourceFileMap(cached.index)
      onProgress?.(cached.index.questions.length, cached.index.questions.length)
      return cached.index
    }
  }

  // 走到这里才真正打 Trees API（首次加载 / 用户强制刷新）
  const trees = await fetchTrees(cfg)

  // 同时尝试两种结构：嵌套（NN_/NNNN_.md）与平铺（NN_.md）
  const dirPrefix = cfg.dir ? `${cfg.dir}/` : ''
  const nestedEntries: { id: string; categoryId: string; sourceFile: string }[] = []
  const flatEntries: { id: string; sourceFile: string }[] = []
  const categorySet = new Map<string, string>() // categoryId -> categoryLabel（嵌套模式用）

  for (const entry of trees.tree) {
    if (entry.type !== 'blob') continue
    if (!entry.path.startsWith(dirPrefix)) continue
    const rest = entry.path.slice(dirPrefix.length)
    const parts = rest.split('/')

    if (parts.length === 1) {
      // 平铺：dir/NN_主题.md
      const m = parts[0].match(FLAT_FILE_PATTERN)
      if (!m) continue
      flatEntries.push({ id: m[1], sourceFile: parts[0] })
    } else if (parts.length === 2) {
      // 嵌套：dir/NN_类目/NNNN_题目.md
      const [categoryId, fileName] = parts
      if (!CATEGORY_PATTERN.test(categoryId)) continue
      const m = fileName.match(QUESTION_FILE_PATTERN)
      if (!m) continue
      nestedEntries.push({
        id: m[1],
        categoryId,
        sourceFile: `${categoryId}/${fileName}`,
      })
      if (!categorySet.has(categoryId)) {
        categorySet.set(categoryId, categoryId.replace(CATEGORY_PATTERN, ''))
      }
    }
    // 深度 >2 的当前忽略
  }

  // 嵌套优先；只有嵌套为空才回落到平铺
  const useFlat = nestedEntries.length === 0 && flatEntries.length > 0
  const fileEntries: { id: string; categoryId: string; sourceFile: string }[] =
    useFlat
      ? flatEntries.map(e => ({
          id: e.id,
          categoryId: FLAT_CATEGORY_ID,
          sourceFile: e.sourceFile,
        }))
      : nestedEntries

  if (useFlat) {
    const flatLabel =
      cfg.dir.split('/').filter(Boolean).pop() || `${cfg.owner}/${cfg.repo}`
    categorySet.set(FLAT_CATEGORY_ID, flatLabel)
  }

  if (fileEntries.length === 0) {
    throw new Error(
      `GitHub 目录 ${cfg.owner}/${cfg.repo}@${cfg.branch}:${cfg.dir || '/'} 没扫到题目文件。\n` +
        `支持两种结构：\n` +
        `  • 嵌套：{dir}/NN_类目/NNNN_题目.md（如 01_Java基础/0054_xxx.md）\n` +
        `  • 平铺：{dir}/NN_主题.md（如 01_Java基础.md）\n` +
        `请检查仓库结构或分支名`,
    )
  }

  // sha 仍一致：保留缓存内容、不重拉全量 markdown
  const cached = readCache(cfg)
  if (cached && cached.sha === trees.sha) {
    primeSourceFileMap(cached.index)
    onProgress?.(cached.index.questions.length, cached.index.questions.length)
    return cached.index
  }

  // 并发拉取并分析
  const total = fileEntries.length
  let done = 0
  onProgress?.(0, total)

  const questions: (Java8guQuestion | null)[] = new Array(total).fill(null)
  await runWithConcurrency(fileEntries, FETCH_CONCURRENCY, async (entry, i) => {
    try {
      const md = await fetchMarkdown(cfg, entry.sourceFile)
      const meta = analyzeMarkdown(md)
      questions[i] = {
        id: entry.id,
        categoryId: entry.categoryId,
        title: meta.title || entry.sourceFile.split('/').pop()!.replace(/\.md$/, '').replace(/_/g, ' '),
        tldr: meta.tldr,
        chars: meta.chars,
        words: meta.words,
        readMin: meta.readMin,
        headings: meta.headings,
        codeCount: meta.codeCount,
        codeLangs: meta.codeLangs,
        hasTable: meta.hasTable,
        hasImage: meta.hasImage,
        difficulty: meta.difficulty,
        difficultyScore: meta.difficultyScore,
        sourceFile: entry.sourceFile,
      }
    } catch {
      // 单题失败：保底兜底数据，整体不中断
      questions[i] = {
        id: entry.id,
        categoryId: entry.categoryId,
        title: entry.sourceFile.split('/').pop()!.replace(/\.md$/, '').replace(/_/g, ' '),
        tldr: '',
        chars: 0,
        words: 0,
        readMin: 1,
        headings: [],
        codeCount: 0,
        codeLangs: [],
        hasTable: false,
        hasImage: false,
        difficulty: 1,
        difficultyScore: 0,
        sourceFile: entry.sourceFile,
      }
    } finally {
      done++
      onProgress?.(done, total)
    }
  })

  // 成功率 < 90% 视为整体失败
  const okCount = questions.filter(q => q && q.chars > 0).length
  if (okCount / total < 0.9) {
    throw new Error(
      `GitHub 拉取成功率过低（${okCount}/${total}），请检查网络或上游仓库`,
    )
  }

  const allQuestions = questions.filter((q): q is Java8guQuestion => q !== null)

  // 按 categoryId 聚合
  const categories: Java8guCategory[] = []
  for (const [categoryId, categoryLabel] of categorySet) {
    const inCat = allQuestions.filter(q => q.categoryId === categoryId)
    const dist = [0, 0, 0, 0, 0]
    for (const q of inCat) dist[q.difficulty - 1]++
    categories.push({
      id: categoryId,
      label: categoryLabel,
      count: inCat.length,
      difficultyDist: dist,
      hue: hashHue(categoryId),
      keywordChips: pickKeywordChips(inCat.map(q => q.title)),
    })
  }
  categories.sort((a, b) => a.id.localeCompare(b.id))

  const index: Java8guIndex = {
    generatedAt: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    categories,
    questions: allQuestions,
  }

  primeSourceFileMap(index)
  writeCache(cfg, { sha: trees.sha, index })
  return index
}

async function fetchTrees(cfg: DataSourceConfig): Promise<TreesResponse> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/trees/${cfg.branch}?recursive=1`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`
  const r = await fetch(url, { headers })
  if (!r.ok) {
    if (r.status === 403 || r.status === 429) {
      const remaining = r.headers.get('x-ratelimit-remaining')
      const reset = r.headers.get('x-ratelimit-reset')
      const resetTip = reset
        ? `重置时间约 ${new Date(Number(reset) * 1000).toLocaleTimeString()}`
        : ''
      const hint = cfg.token
        ? '已带 token，仍触发限流，请检查 token 是否过期或额度耗尽'
        : '匿名访问 60 次/小时。可在「数据源」配置里填一个 GitHub Personal Access Token 把额度升到 5000 次/小时'
      throw new Error(
        `GitHub API 限流（HTTP ${r.status}，剩余配额 ${remaining ?? '?'}）。${resetTip}\n${hint}`,
      )
    }
    if (r.status === 404) {
      throw new Error(
        `仓库或分支不存在（HTTP 404）：${cfg.owner}/${cfg.repo}@${cfg.branch}。请检查「数据源」配置`,
      )
    }
    throw new Error(`加载题库目录失败：GitHub Trees API HTTP ${r.status}`)
  }
  const data = (await r.json()) as TreesResponse
  if (data.truncated) {
    console.warn(
      '[java8gu] GitHub trees response truncated; 仓库文件数超出 API 单次返回上限',
    )
  }
  return data
}

async function fetchMarkdown(
  cfg: DataSourceConfig,
  sourceFile: string,
): Promise<string> {
  // 中文目录/文件名要 encode 后再请求 raw.githubusercontent.com
  const rawBase = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}`
  const dirSeg = cfg.dir
    ? cfg.dir.split('/').map(encodeURIComponent).join('/') + '/'
    : ''
  const fileSeg = sourceFile.split('/').map(encodeURIComponent).join('/')
  const url = `${rawBase}/${dirSeg}${fileSeg}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${sourceFile}`)
  return r.text()
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      await worker(items[i], i)
    }
  })
  await Promise.all(runners)
}

function readCache(cfg: DataSourceConfig): CachedIndex | null {
  const key = cacheKeyOf(cfg)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedIndex
    if (!parsed.sha || !parsed.index) return null
    return parsed
  } catch {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    return null
  }
}

function writeCache(cfg: DataSourceConfig, payload: CachedIndex): void {
  try {
    window.localStorage.setItem(cacheKeyOf(cfg), JSON.stringify(payload))
  } catch {
    // quota exceeded 等：静默忽略，本次内存索引仍可用
  }
}

function primeSourceFileMap(index: Java8guIndex): void {
  sourceFileById.clear()
  for (const q of index.questions) {
    sourceFileById.set(q.id, q.sourceFile)
  }
}

export function loadMarkdown(id: string): Promise<string> {
  let p = markdownCache.get(id)
  if (!p) {
    p = (async () => {
      const sourceFile = sourceFileById.get(id)
      if (!sourceFile) {
        // 调用方未先 loadIndex 就直接 loadMarkdown(id) 的兜底
        const idx = await loadIndex()
        const q = idx.questions.find(x => x.id === id)
        if (!q) throw new Error(`未找到题目 ${id}`)
        return fetchMarkdown(getDataSource(), q.sourceFile)
      }
      return fetchMarkdown(getDataSource(), sourceFile)
    })().catch(e => {
      markdownCache.delete(id)
      throw e
    })
    markdownCache.set(id, p)
  }
  return p
}

export function findCategory(
  index: Java8guIndex,
  id: string,
): Java8guCategory | undefined {
  return index.categories.find(c => c.id === id)
}

export function findQuestion(
  index: Java8guIndex,
  id: string,
): Java8guQuestion | undefined {
  return index.questions.find(q => q.id === id)
}

export interface CategoryView {
  category: Java8guCategory
  /** 按难度浅→深排过序的题目 */
  questions: Java8guQuestion[]
}

export function viewCategory(
  index: Java8guIndex,
  id: string,
): CategoryView | undefined {
  const category = findCategory(index, id)
  if (!category) return undefined
  const questions = index.questions
    .filter(q => q.categoryId === id)
    .sort((a, b) => a.id.localeCompare(b.id))
  return { category, questions }
}
