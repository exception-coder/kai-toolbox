import type { AssistantWidgetMountOptions, AssistantWidgetState } from './types'

/** Small composer adapter; audio ownership stays in the transport's voice session. */
export function mountAssistantVoiceControls(root: HTMLElement, shadow: ShadowRoot,
  voice: AssistantWidgetMountOptions['voice']): () => void {
  if (!voice) return () => {}
  const row = document.createElement('div')
  row.className = 'voice-controls'
  row.setAttribute('aria-label', '语音对话')
  row.innerHTML = '<button class="image-add" type="button" data-voice-start>语音对话</button>'
    + '<button class="image-add" type="button" data-voice-mute hidden>静音</button>'
    + '<button class="image-add" type="button" data-voice-stop hidden>挂断</button>'
    + '<span role="status" aria-live="polite"></span>'
  const buttons = row.querySelectorAll('button')
  const [start, mute, stop] = buttons
  const status = row.querySelector('span')!
  start.onclick = voice.start
  mute.onclick = voice.mute
  stop.onclick = voice.stop
  const style = document.createElement('style')
  style.textContent = '.voice-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}.voice-controls button{min-height:44px}.voice-controls span{font-size:12px;color:#52525b;overflow-wrap:anywhere}.voice-controls button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.voice-controls button:disabled{opacity:.5;cursor:wait}'
  shadow.append(style)
  shadow.querySelector('.composer')?.prepend(row)
  const update = (event: Event) => {
    const state = (event as CustomEvent<AssistantWidgetState>).detail.voice
    if (!state) return
    const active = state.status === 'connecting' || state.status === 'connected'
    start.hidden = active
    mute.hidden = state.status !== 'connected'
    stop.hidden = !active
    start.textContent = state.status === 'idle' ? '语音对话' : '重新连接语音'
    mute.textContent = state.muted ? '取消静音' : '静音'
    mute.setAttribute('aria-pressed', String(state.muted))
    status.textContent = state.message ?? (state.status === 'connecting' ? '正在连接…'
      : state.status === 'connected' ? (state.muted ? '麦克风已静音' : '正在通话') : '')
  }
  root.addEventListener('kai-assistant-state', update)
  return () => { root.removeEventListener('kai-assistant-state', update); row.remove(); style.remove() }
}
