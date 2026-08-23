import { useCallback, useEffect, useRef, useState } from 'react'
import { getDevDocContent, getSession, saveDevDocContent, startGenerateDevDoc, type QaPair } from '../api'
import type { ClarifyEngine } from '../components/dialogs/StartClarifyDialog'

interface UseDevDocStateOptions {
  sessionId: string
  hasDevDoc: boolean
  active: boolean
  workStatus?: 'BUILDING_QUESTIONS' | 'AWAITING_ANSWERS' | 'GENERATING' | 'ERROR' | 'DONE' | null
  workError?: string | null
  workProgress?: string | null
  workContent?: string | null
}

const BACKGROUND_POLL_INTERVAL_MS = 2_000

/** 管理开发文档加载、编辑、保存和 SSE 生成生命周期。 */
export function useDevDocState({
  sessionId,
  hasDevDoc,
  active,
  workStatus,
  workError,
  workProgress,
  workContent,
}: UseDevDocStateOptions) {
  const [content, setContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [progress, setProgress] = useState('')
  const [loading, setLoading] = useState(hasDevDoc && workStatus !== 'GENERATING')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const monitorTimerRef = useRef<number | null>(null)
  const monitoringRef = useRef(false)
  const disposedRef = useRef(false)
  const accumulatedRef = useRef('')
  const previousSessionIdRef = useRef(sessionId)

  const loadPersisted = useCallback(async () => {
    try {
      const persisted = await getDevDocContent(sessionId)
      if (!persisted) return false
      accumulatedRef.current = persisted
      setContent(persisted)
      setStreaming(false)
      setProgress('')
      return true
    } catch {
      return false
    }
  }, [sessionId])

  useEffect(() => {
    if (!active || content || workStatus === 'GENERATING') return
    if (!hasDevDoc) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void getDevDocContent(sessionId)
      .then(value => {
        if (!cancelled && value) setContent(value)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [active, content, hasDevDoc, sessionId, workStatus])

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      abortRef.current?.()
      if (monitorTimerRef.current !== null) window.clearTimeout(monitorTimerRef.current)
    }
  }, [])

  const monitorBackgroundResult = useCallback(() => {
    if (monitoringRef.current) return
    monitoringRef.current = true
    setProgress(current => current || '后台仍在生成执行计划…')
    const poll = () => {
      if (disposedRef.current) return
      void getSession(sessionId).then(latest => {
        if (disposedRef.current) return
        if (latest.devDocWorkStatus === 'DONE') {
          monitoringRef.current = false
          void loadPersisted().then(loaded => {
            setStreaming(false)
            setProgress('')
            if (!loaded) setError('执行计划已生成，但暂时无法读取保存结果，请刷新页面')
          })
        } else if (latest.devDocWorkStatus === 'ERROR') {
          monitoringRef.current = false
          setStreaming(false)
          setProgress('')
          setError(latest.devDocWorkError || '执行计划生成失败，可点击重试')
        } else {
          const snapshot = latest.devDocWorkContent || ''
          if (snapshot.length >= accumulatedRef.current.length) {
            accumulatedRef.current = snapshot
            setContent(snapshot)
          }
          setStreaming(true)
          setLoading(false)
          setProgress(latest.devDocWorkProgress || '后台仍在生成执行计划…')
          monitorTimerRef.current = window.setTimeout(poll, BACKGROUND_POLL_INTERVAL_MS)
        }
      }).catch(() => {
        if (disposedRef.current) return
        setProgress('正在重新连接后台任务…')
        monitorTimerRef.current = window.setTimeout(poll, BACKGROUND_POLL_INTERVAL_MS)
      })
    }
    poll()
  }, [loadPersisted, sessionId])

  useEffect(() => {
    if (!active || workStatus !== 'GENERATING') return
    const snapshot = workContent || ''
    if (snapshot.length >= accumulatedRef.current.length) {
      accumulatedRef.current = snapshot
      setContent(snapshot)
    }
    setStreaming(true)
    setLoading(false)
    setError(null)
    setProgress(workProgress || '后台仍在生成执行计划…')
    monitorBackgroundResult()
  }, [active, monitorBackgroundResult, workContent, workProgress, workStatus])

  useEffect(() => {
    if (workStatus !== 'ERROR') return
    setStreaming(false)
    setLoading(false)
    setProgress('')
    setError(workError || '执行计划生成失败，可重新生成')
  }, [workError, workStatus])

  useEffect(() => {
    if (previousSessionIdRef.current === sessionId) return
    previousSessionIdRef.current = sessionId
    accumulatedRef.current = ''
    monitoringRef.current = false
    abortRef.current?.()
    abortRef.current = null
    if (monitorTimerRef.current !== null) window.clearTimeout(monitorTimerRef.current)
    setContent('')
    setStreaming(false)
    setProgress('')
    setLoading(hasDevDoc && workStatus !== 'GENERATING')
    setDirty(false)
    setError(null)
    if (active && workStatus === 'GENERATING') {
      const snapshot = workContent || ''
      accumulatedRef.current = snapshot
      setContent(snapshot)
      setStreaming(true)
      setLoading(false)
      setProgress(workProgress || '后台仍在生成执行计划…')
      monitorBackgroundResult()
    }
  }, [active, hasDevDoc, monitorBackgroundResult, sessionId, workContent, workProgress, workStatus])

  const generate = (
    extraInstructions?: string,
    updateExisting?: boolean,
    qaHistory?: QaPair[],
    engine: ClarifyEngine = 'codex',
  ) => {
    setContent('')
    setStreaming(true)
    setProgress(engine === 'codex' ? '正在连接 Codex…' : '正在连接 Claude…')
    setLoading(false)
    setError(null)
    accumulatedRef.current = ''
    abortRef.current?.()
    if (monitorTimerRef.current !== null) window.clearTimeout(monitorTimerRef.current)
    monitoringRef.current = false
    let terminalEventReceived = false

    abortRef.current = startGenerateDevDoc(sessionId, extraInstructions, updateExisting, qaHistory, true, {
      onEvent(name, data) {
        if (name === 'progress') {
          setProgress((data as { message?: string }).message || '正在生成开发文档…')
        } else if (name === 'chunk') {
          accumulatedRef.current += (data as { content?: string }).content ?? ''
          setContent(accumulatedRef.current)
          setProgress(`${engine === 'codex' ? 'Codex' : 'Claude'} 正在生成，已接收 ${accumulatedRef.current.length.toLocaleString()} 字符`)
        } else if (name === 'done') {
          terminalEventReceived = true
          setProgress('生成完成，正在读取已保存文档…')
          void loadPersisted().then(loaded => {
            setStreaming(false)
            setProgress('')
            if (!loaded && !accumulatedRef.current) setError('生成已结束，但未能读取保存结果，请刷新页面重试')
          })
        } else if (name === 'error') {
          terminalEventReceived = true
          setStreaming(false)
          setProgress('')
          setError((data as { message?: string }).message || '开发文档生成失败，可点击重试')
        }
      },
      onError() {
        monitorBackgroundResult()
      },
      onClose() {
        if (terminalEventReceived) return
        monitorBackgroundResult()
      },
    }, engine, true)
  }

  const changeContent = (value: string) => {
    setContent(value)
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveDevDocContent(sessionId, content)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  return {
    content,
    streaming,
    progress,
    loading,
    dirty,
    saving,
    error,
    clearError: () => setError(null),
    generate,
    changeContent,
    save,
  }
}
