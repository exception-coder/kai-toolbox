import { useCallback, useEffect, useState } from 'react'

/** 待聚合篮子里的一条:跨项目钉选的一个模块。 */
export interface AggregationItem {
  /** 所属项目目录名(= 知识库 project key) */
  projectName: string
  /** 所属项目根绝对路径(聚合时按此去重，物理软链项目根) */
  projectPath: string
  /** 模块业务名 */
  moduleName: string
  /** 模块相对项目根路径(用于生成联动提示) */
  moduleRelPath: string
  /** 模块绝对路径(唯一标识，去重键) */
  modulePath: string
}

const STORAGE_KEY = 'kai-toolbox:project-workspace:aggregation-cart'

function load(): AggregationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as AggregationItem[]) : []
  } catch {
    return []
  }
}

/**
 * 跨项目「待聚合」篮子，持久化在 localStorage。
 * 用于勾选多个项目的模块、一键聚合成合并工作区联动开发。
 * 同一 modulePath 视为同一条(幂等)。多个标签页通过 storage 事件同步。
 */
export function useAggregationCart() {
  const [items, setItems] = useState<AggregationItem[]>(load)

  // 写回本地
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // 忽略隐私模式/配额异常
    }
  }, [items])

  // 跨标签页同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const has = useCallback((modulePath: string) => items.some(i => i.modulePath === modulePath), [items])

  const toggle = useCallback((item: AggregationItem) => {
    setItems(prev => prev.some(i => i.modulePath === item.modulePath)
      ? prev.filter(i => i.modulePath !== item.modulePath)
      : [...prev, item])
  }, [])

  const remove = useCallback((modulePath: string) => {
    setItems(prev => prev.filter(i => i.modulePath !== modulePath))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  return { items, has, toggle, remove, clear }
}

/** 聚合提示在 sessionStorage 的约定 key：会话页 mount 时读一次并清除，预填进输入框。 */
export const AGGREGATION_DRAFT_KEY = 'kai-toolbox:claude-chat:aggregation-draft'
