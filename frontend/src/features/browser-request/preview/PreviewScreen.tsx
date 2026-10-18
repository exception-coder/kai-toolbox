import { useEffect, useState } from 'react'
import { previewFrame, previewInput } from './api'

/** 使用受保护的截图接口，认证令牌不进入图片 URL 或预览链接。 */
export function PreviewScreen({ id, interactive, phone }: { id: string; interactive: boolean; phone: boolean }) {
  const [frame, setFrame] = useState('')
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  useEffect(() => {
    let stopped = false
    let objectUrl = ''
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    setFrame(''); setError('')
    const refresh = async () => {
      try {
        const blob = await previewFrame(id, controller.signal)
        if (stopped) return
        const next = URL.createObjectURL(blob)
        setFrame(next); setError('')
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = next
      } catch (failure) {
        if (!stopped) setError(failure instanceof Error ? failure.message : '画面读取失败')
      } finally {
        if (!stopped) timer = setTimeout(refresh, 1500)
      }
    }
    void refresh()
    return () => { stopped = true; controller.abort(); clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id])
  async function input(value: object) {
    try { await previewInput(id, value); setError('') }
    catch (failure) { setError(failure instanceof Error ? failure.message : '操作失败') }
  }
  return <section aria-label="实际页面画面" className="preview-screen">
    {error && <p role="alert" className="preview-error">{error}</p>}
    {!frame && !error && <p role="status">正在获取浏览器画面…</p>}
    {frame && <img src={frame} alt="目标页面的实时渲染画面" draggable={false} className={phone ? 'preview-frame preview-frame-phone' : 'preview-frame'}
      onClick={event => {
        if (!interactive) return
        const rect = event.currentTarget.getBoundingClientRect()
        void input({ type: 'click', x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height })
      }}
      onWheel={event => { if (interactive) void input({ type: 'scroll', deltaY: event.deltaY }) }} />}
    {interactive && <div className="preview-takeover">
      <p>接管中的点击和输入会作用于真实页面，请确认当前账号与环境。</p>
      <form onSubmit={event => { event.preventDefault(); void input({ type: 'text', text }); setText('') }}>
        <input aria-label="向页面输入文字" autoComplete="off" type="text" value={text} maxLength={1000} onChange={event => setText(event.target.value)} placeholder="先点击画面中的输入框，再输入文字" />
        <button type="submit" disabled={!text}>输入</button>
        <button type="button" onClick={() => void input({ type: 'key', key: 'Enter' })}>Enter</button>
        <button type="button" onClick={() => void input({ type: 'key', key: 'Escape' })}>Esc</button>
        <button type="button" onClick={() => void input({ type: 'scroll', deltaY: 600 })}>向下滚动</button>
      </form>
    </div>}
  </section>
}
