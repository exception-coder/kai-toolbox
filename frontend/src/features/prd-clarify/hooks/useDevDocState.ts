import { useCallback, useEffect, useRef, useState } from 'react'
import { getDevDocContent, saveDevDocContent, startGenerateDevDoc, type QaPair } from '../api'
import type { ClarifyEngine } from '../components/dialogs/StartClarifyDialog'

interface UseDevDocStateOptions {
  sessionId: string
  hasDevDoc: boolean
  active: boolean
}

/** 管理开发文档加载、编辑、保存和 SSE 生成生命周期。 */
export function useDevDocState({ sessionId, hasDevDoc, active }: UseDevDocStateOptions) {
  const [content, setContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [progress, setProgress] = useState('')
  const [loading, setLoading] = useState(hasDevDoc)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const accumulatedRef = useRef('')

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
    if (!active || content) return
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
  }, [active, content, hasDevDoc, sessionId])

  useEffect(() => () => abortRef.current?.(), [])

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
        setStreaming(false)
        setProgress('')
        setError('SSE 连接中断，请点击重试')
      },
      onClose() {
        if (terminalEventReceived) return
        void loadPersisted().then(loaded => {
          if (!loaded) {
            setStreaming(false)
            setProgress('')
            setError('生成连接已关闭，且暂未读取到生成结果，请重试')
          }
        })
      },
    }, engine)
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
