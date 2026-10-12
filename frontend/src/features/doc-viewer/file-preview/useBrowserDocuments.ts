import { useCallback, useEffect, useRef, useState } from 'react'
import { readBrowserDocument, validateBrowserFiles, type BrowserDocument } from './browserDocument'

export function useBrowserDocuments() {
  const [documents, setDocuments] = useState<BrowserDocument[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const idRef = useRef(0)

  useEffect(() => () => { requestRef.current++ }, [])

  const openFiles = useCallback(async (files: File[]) => {
    const request = ++requestRef.current
    setOpen(true)
    setReading(true)
    setError(null)
    try {
      validateBrowserFiles(files)
      const loaded = await Promise.all(files.map(file => readBrowserDocument(file, ++idRef.current)))
      if (request !== requestRef.current) return
      setDocuments(loaded)
      setActiveId(loaded[0].id)
    } catch (cause) {
      if (request !== requestRef.current) return
      setError(cause instanceof Error ? cause.message : '文件读取失败，请重新选择。')
    } finally {
      if (request === requestRef.current) setReading(false)
    }
  }, [])

  const close = useCallback(() => {
    requestRef.current++
    setOpen(false)
    setReading(false)
    setError(null)
    setDocuments([])
    setActiveId(null)
  }, [])

  return {
    documents, activeId, activeDocument: documents.find(document => document.id === activeId) ?? null,
    open, reading, error, openFiles, close, selectDocument: setActiveId,
  }
}
