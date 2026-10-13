import { useEffect, useRef, useState, type RefObject } from 'react'
import type { CodeEditorRef } from '../../components/CodeEditor'

export function useJavaResultActions(outputRef: RefObject<CodeEditorRef | null>, valid: boolean) {
  const [feedback, setFeedback] = useState('')
  const revision = useRef(0)
  useEffect(() => { revision.current++; setFeedback('') }, [valid])
  useEffect(() => () => { revision.current++ }, [])
  const copy = async () => {
    if (!valid) return
    const id = revision.current
    const value = outputRef.current?.getValue() ?? ''
    try {
      await navigator.clipboard.writeText(value)
      if (id === revision.current) setFeedback('已复制格式化结果。')
    } catch {
      if (id !== revision.current) return
      outputRef.current?.focusAt(0, value.length)
      setFeedback('浏览器未允许复制，已选中结果；请用 Ctrl/⌘+C 或系统复制菜单。')
    }
  }
  const download = () => {
    if (!valid) return
    const value = outputRef.current?.getValue() ?? ''
    const url = URL.createObjectURL(new Blob([value], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'formatted.java'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setFeedback('已生成 formatted.java 下载文件。')
  }
  return { copy, download, feedback }
}
