// 提示音:用 Web Audio 合成「叮咚」两声,无需音频文件、离线可用。
// 注意浏览器自动播放策略:AudioContext 需用户手势后才能出声;用户在本页发过消息即满足,
// 故首次 resume 后正常。页面切后台时 Web Audio 多被挂起,此时靠系统通知(SW)发声,见 browserNotify。

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
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
