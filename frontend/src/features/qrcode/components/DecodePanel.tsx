import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clipboard, Copy, ExternalLink, ImagePlus, ScanLine, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  blobToDataUrl,
  decodeFromBlob,
  looksLikeUrl,
  pickImageFromClipboard,
  type DecodeResult,
} from '../lib/decode'

type Status = 'idle' | 'scanning' | 'ok' | 'fail'

export function DecodePanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<DecodeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const reset = useCallback(() => {
    setPreviewUrl(null)
    setResult(null)
    setError(null)
    setStatus('idle')
    setCopied(false)
  }, [])

  const handleBlob = useCallback(async (blob: Blob | null) => {
    if (!blob) return
    if (!blob.type.startsWith('image/')) {
      setError('只支持图片格式')
      setStatus('fail')
      return
    }
    setStatus('scanning')
    setError(null)
    setResult(null)
    try {
      const [dataUrl, scan] = await Promise.all([blobToDataUrl(blob), decodeFromBlob(blob)])
      setPreviewUrl(dataUrl)
      if (scan) {
        setResult(scan)
        setStatus('ok')
      } else {
        setStatus('fail')
        setError('未能识别出二维码，请换张更清晰的图片再试')
      }
    } catch (e) {
      setStatus('fail')
      setError(e instanceof Error ? e.message : '识别失败')
    }
  }, [])

  // 全局粘贴：随便在哪 Ctrl+V 都能命中
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = pickImageFromClipboard(e)
      if (file) {
        e.preventDefault()
        void handleBlob(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleBlob])

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    void handleBlob(f)
    e.target.value = '' // 允许重复选同一张
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files?.[0] ?? null
    void handleBlob(f)
  }

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const copyText = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 非 https 下 clipboard 可能拒绝；用户可手动选中文本
    }
  }

  const tryReadClipboardImage = async () => {
    // 仅在 https / localhost 下可用；不支持则提示用户走 Ctrl+V
    if (!navigator.clipboard || !('read' in navigator.clipboard)) {
      setError('当前环境不支持读剪贴板，请用 Ctrl+V 粘贴')
      setStatus('fail')
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'))
        if (imgType) {
          const blob = await item.getType(imgType)
          await handleBlob(blob)
          return
        }
      }
      setError('剪贴板里没有图片')
      setStatus('fail')
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取剪贴板失败')
      setStatus('fail')
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'relative flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragOver
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
            : 'border-[var(--color-border)] bg-[var(--color-muted)]/40 hover:border-[var(--color-primary)]/60 hover:bg-[var(--color-muted)]',
        ].join(' ')}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-background)] text-[var(--color-primary)] shadow-sm">
          <ScanLine className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-[var(--color-foreground)]">
            把图片拖到这里，或在页面任意位置按 <kbd className="rounded border bg-[var(--color-background)] px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd>{' '}
            + <kbd className="rounded border bg-[var(--color-background)] px-1.5 py-0.5 font-mono text-xs">V</kbd> 粘贴
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            支持 PNG / JPG / WebP / GIF，整张图片在本机内识别，不会上传
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickFile}
          />
          <Button
            variant="default"
            size="lg"
            className="shadow-md"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload />
            选择图片
          </Button>
          <Button variant="outline" size="lg" onClick={tryReadClipboardImage}>
            <Clipboard />
            读剪贴板
          </Button>
        </div>
      </div>

      {status === 'scanning' && (
        <div className="rounded-md border bg-[var(--color-muted)]/40 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
          识别中…
        </div>
      )}

      {previewUrl && status !== 'scanning' && (
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
          <div className="relative">
            <img
              src={previewUrl}
              alt="预览"
              className="max-h-48 w-full rounded-md border object-contain bg-[var(--color-muted)]/40"
            />
            <button
              type="button"
              onClick={reset}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-[var(--color-background)] text-[var(--color-muted-foreground)] shadow-sm hover:text-[var(--color-foreground)]"
              aria-label="清除"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-w-0 space-y-3">
            {status === 'ok' && result && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                    <span>识别结果</span>
                    {result.url && (
                      <span className="rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">
                        URL
                      </span>
                    )}
                  </div>
                  <div className="break-all rounded-md border bg-[var(--color-muted)] px-3 py-2 font-mono text-sm">
                    {result.text}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="default" onClick={copyText}>
                    {copied ? <Check className="text-emerald-300" /> : <Copy />}
                    {copied ? '已复制' : '复制文本'}
                  </Button>
                  {result.url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={result.url} target="_blank" rel="noreferrer noopener">
                        <ExternalLink />
                        新标签打开
                      </a>
                    </Button>
                  )}
                </div>
              </>
            )}

            {status === 'fail' && (
              <div className="space-y-2">
                <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
                  {error ?? '识别失败'}
                </div>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  常见原因：二维码太小 / 模糊 / 反光 / 被裁切。可以放大原图后重试。
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!previewUrl && status !== 'scanning' && status === 'fail' && error && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {status === 'idle' && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <ImagePlus className="h-3.5 w-3.5" />
          提示：从微信、手机截图、网页截图直接 Ctrl+V 即可识别
        </div>
      )}
    </div>
  )
}
