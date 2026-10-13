import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { CodeEditorRef } from '../../components/CodeEditor'
import { DEFAULT_JAVA_OPTIONS, JAVA_MAX_BYTES, type JavaFormatOptions } from './contracts'
import { JavaFormatClient } from './JavaFormatClient'

export function useJavaFormatter(inputRef: RefObject<CodeEditorRef | null>, outputRef: RefObject<CodeEditorRef | null>, active: boolean) {
  const client = useRef<JavaFormatClient | null>(null)
  const generation = useRef(0)
  const busyRef = useRef(false)
  const [options, setOptions] = useState(DEFAULT_JAVA_OPTIONS)
  const [inputBytes, setInputBytes] = useState(0)
  const [busy, setBusy] = useState(false)
  const [valid, setValid] = useState(false)
  const [resultMeta, setResultMeta] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('粘贴 Java 代码，支持直接查看方法片段。')

  const invalidate = useCallback(() => {
    generation.current++
    if (busyRef.current) client.current?.cancel()
    busyRef.current = false
    setBusy(false); setValid(false); setError('')
    setStatus('原文或选项已更新，请格式化当前版本。')
  }, [])
  const changeInput = useCallback((input: string) => { invalidate(); setInputBytes(new Blob([input]).size) }, [invalidate])
  const changeOptions = useCallback((next: JavaFormatOptions) => { invalidate(); setOptions(next) }, [invalidate])
  const cancel = useCallback(() => { invalidate(); setStatus('已取消格式化，原文和上一份结果已保留。') }, [invalidate])

  useEffect(() => { if (!active && busyRef.current) cancel() }, [active, cancel])
  useEffect(() => () => { generation.current++; client.current?.cancel() }, [])

  const run = useCallback(async () => {
    if (busyRef.current) return false
    const input = inputRef.current?.getValue() ?? ''
    if (!input.trim() || new Blob([input]).size > JAVA_MAX_BYTES) {
      setError(input.trim() ? '代码超过 256 KB，请选择较小的片段；原文已保留。' : '先粘贴需要查看的 Java 代码。')
      return false
    }
    const id = ++generation.current
    client.current ??= new JavaFormatClient()
    busyRef.current = true
    setBusy(true); setValid(false); setError(''); setStatus('正在本地格式化…')
    try {
      const result = await client.current.run(input, options)
      if (id !== generation.current) return false
      if (!result.ok) {
        setError(result.error)
        if (result.position !== undefined) inputRef.current?.focusAt(result.position, result.position)
        return false
      }
      outputRef.current?.setValue(result.output)
      setResultMeta(`${result.kind} · ${result.output.trimEnd().split('\n').length} 行`)
      setValid(true); setStatus('格式化完成，原文已保留。')
      return true
    } catch (error) {
      if (id === generation.current) setError(error instanceof Error ? error.message : '格式化失败，请重试。')
      return false
    } finally {
      if (id === generation.current) { busyRef.current = false; setBusy(false) }
    }
  }, [inputRef, outputRef, options])

  return { options, changeOptions, changeInput, inputBytes, busy, valid, resultMeta, error, status, run, cancel }
}
