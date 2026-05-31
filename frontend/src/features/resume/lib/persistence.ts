// 简历状态持久化：后端 SQLite 为 source of truth；localStorage 作为离线兜底
// - 启动时：优先 GET /api/resume/state；失败回退 localStorage
// - 修改时：debounced PUT 后端 + 同步写 localStorage
import { http } from '@/lib/api'
import type { ResumeState, TemplateId, AccentColor } from '../types'
import { SAMPLE_RESUME } from './sampleData'

const STORAGE_KEY = 'kai-toolbox:resume:state'

export const DEFAULT_STATE: ResumeState = {
  data: SAMPLE_RESUME,
  template: 'classic',
  accent: 'indigo',
}

interface ResumeKvView {
  valueJson: string | null
}

/**
 * 异步加载简历状态：后端优先 → localStorage → 默认。
 * 后端有数据时同步写入 localStorage 作为离线缓存。
 */
export async function loadState(): Promise<ResumeState> {
  try {
    const resp = await http<ResumeKvView>('/resume/state')
    if (resp.valueJson) {
      const parsed = JSON.parse(resp.valueJson)
      const merged = mergeWithDefault(parsed)
      writeLocalStorage(merged)
      return merged
    }
  } catch (e) {
    console.warn('[resume] 后端加载失败，回退 localStorage:', e)
  }
  return loadFromLocalStorage()
}

/**
 * 同步写入：写本地 + 异步推后端。后端失败不阻塞 UI，下次启动仍可从本地恢复。
 * 调用方应做 debounce（见 ResumePage 的 useEffect）。
 */
export function saveState(state: ResumeState): void {
  writeLocalStorage(state)
  // fire-and-forget；后端失败时下次刷新 / 下次保存还会再尝试
  http('/resume/state', {
    method: 'PUT',
    body: JSON.stringify({ valueJson: JSON.stringify(state) }),
  }).catch(e => console.warn('[resume] 后端保存失败（本地已写入）:', e))
}

function loadFromLocalStorage(): ResumeState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    return mergeWithDefault(JSON.parse(raw))
  } catch {
    return DEFAULT_STATE
  }
}

function writeLocalStorage(state: ResumeState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('[resume] localStorage write failed:', e)
  }
}

function mergeWithDefault(input: unknown): ResumeState {
  if (!input || typeof input !== 'object') return DEFAULT_STATE
  const obj = input as Partial<ResumeState>
  return {
    data: mergeData(obj.data),
    template: isTemplate(obj.template) ? obj.template : DEFAULT_STATE.template,
    accent: isAccent(obj.accent) ? obj.accent : DEFAULT_STATE.accent,
  }
}

function mergeData(input: unknown): ResumeState['data'] {
  if (!input || typeof input !== 'object') return DEFAULT_STATE.data
  const d = input as Partial<ResumeState['data']>
  return {
    basics: { ...DEFAULT_STATE.data.basics, ...(d.basics ?? {}) },
    work: Array.isArray(d.work) ? d.work : DEFAULT_STATE.data.work,
    projects: Array.isArray(d.projects) ? d.projects : DEFAULT_STATE.data.projects,
    education: Array.isArray(d.education) ? d.education : DEFAULT_STATE.data.education,
    skills: Array.isArray(d.skills) ? d.skills.filter(s => typeof s === 'string') : DEFAULT_STATE.data.skills,
  }
}

function isTemplate(v: unknown): v is TemplateId {
  return v === 'classic' || v === 'sidebar' || v === 'minimal' || v === 'gradient' || v === 'timeline'
}

function isAccent(v: unknown): v is AccentColor {
  return v === 'indigo' || v === 'rose' || v === 'emerald' || v === 'amber' || v === 'slate'
}
