// 提示音:用 Web Audio 合成「叮咚」两声,无需音频文件、离线可用,http 下也能用(不需 HTTPS)。
//
// 关键:浏览器自动播放策略要求 AudioContext 必须在「用户手势」内首次解锁,否则
// 在 WS 通知回调里(非手势)resume() 会被拦 → 没声音。故本模块在首个用户手势
// (pointerdown/keydown/touchstart)里抢先创建并 resume 一次 AudioContext(放一声near-silent
// blip 彻底解锁),之后任意时刻 playNotifySound() 才出得了声。
// 注意:页面切后台/锁屏时 Web Audio 多被系统挂起,此时靠系统通知(SW)发声,见 browserNotify。

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/**
 * 取共享 AudioContext（与提示音复用同一实例，避免多开）。
 * 须在用户手势链路内首次调用以满足移动端自动播放策略；返回 null 表示不支持。
 */
export function getSharedAudioContext(): AudioContext | null {
  return getCtx()
}

/** 在用户手势内调用一次:创建 + resume AudioContext，并放一声极轻 blip 彻底解锁。 */
function unlock(): void {
  const c = getCtx()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const gain = c.createGain()
    gain.gain.value = 0.0001 // 近无声,只为解锁
    osc.connect(gain).connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + 0.01)
  } catch {
    // 忽略
  }
}

// 模块加载即挂一次性手势监听:用户首次点/触/按键时解锁音频上下文
if (typeof window !== 'undefined') {
  const onGesture = () => {
    unlock()
    window.removeEventListener('pointerdown', onGesture)
    window.removeEventListener('keydown', onGesture)
    window.removeEventListener('touchstart', onGesture)
  }
  window.addEventListener('pointerdown', onGesture, { passive: true })
  window.addEventListener('keydown', onGesture)
  window.addEventListener('touchstart', onGesture, { passive: true })
}

/** 播放「叮咚」提示音(高→低两声 sine);失败静默。 */
export function playNotifySound(): void {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const tone = (freq: number, start: number, dur: number) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + start)
    gain.gain.exponentialRampToValueAtTime(0.28, now + start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
    osc.connect(gain).connect(c.destination)
    osc.start(now + start)
    osc.stop(now + start + dur)
  }
  tone(880, 0, 0.18)     // 叮
  tone(660, 0.16, 0.30)  // 咚
}
