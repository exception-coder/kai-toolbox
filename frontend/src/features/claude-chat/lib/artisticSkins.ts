import type { CSSProperties } from 'react'

export const ARTISTIC_SKINS = [
  { id: 'atelier-paper', name: 'Atelier Paper', description: '手工纸工坊 · 纤维与叠页', colors: ['#eee5d2', '#faf3e4', '#e7dcc6', '#e2d6bf', '#a49476', '#342b22', '#594b3b', '#664323', '#713b2d', '#365131'] },
  { id: 'editorial-press', name: 'Editorial Press', description: '复古报刊 · 油墨与校样', colors: ['#e8e5dc', '#f6f3eb', '#dfdcd2', '#d9d5c9', '#929083', '#23251f', '#484a40', '#344e53', '#753a32', '#375038'] },
  { id: 'amber-crt', name: 'Amber CRT', description: '琥珀终端 · 扫描线与屏框', colors: ['#16130e', '#201b13', '#100f0b', '#2c251a', '#776343', '#f6e3bc', '#d6bc8c', '#f2c36b', '#f3d5a0', '#d4d99a'] },
  { id: 'liquid-titanium', name: 'Liquid Titanium', description: '液态钛金 · 拉丝与冷光', colors: ['#20252b', '#2a3038', '#191e24', '#353c45', '#71808f', '#f0f3f6', '#c1cbd5', '#b8d8eb', '#e0c8de', '#b8dfd1'] },
] as const

/** 只组织展示，不迁移已有偏好 ID；旧款作为同一艺术语言的变体。 */
export const SKIN_FAMILIES = [
  { id: 'paper', name: 'Atelier Paper', label: '手工纸工坊', description: '信纸叠边 · 便笺输入 · 打字稿代码', variants: ['atelier-paper', 'butter-paper'] },
  { id: 'press', name: 'Editorial Press', label: '报纸编辑室', description: '开放稿面 · 编辑栏 · 校样批注', variants: ['editorial-press', 'newsroom'] },
  { id: 'terminal', name: 'Retro Terminal', label: '复古终端', description: '连续输出 · 屏框 · 命令输入栏', variants: ['amber-crt', 'phosphor-terminal'] },
  { id: 'metal', name: 'Liquid Titanium', label: '液态钛金', description: '烟灰浮层 · 拉丝边缘 · 精密控制台', variants: ['liquid-titanium', 'aurora-glass'] },
] as const

export function skinFamily(theme: string) {
  return SKIN_FAMILIES.find(family => family.variants.some(id => id === theme))
}

/** 静态矢量纤维；没有滤镜、外部请求或覆盖文字的前景层。 */
export const paperFiber = (strength: number) => {
  if (strength <= 0) return 'none'
  // Deterministic, short curved fibers and fine grain; static SVG avoids a live noise filter.
  const marks = Array.from({ length: 120 }, (_, i) => {
    const x = ((i * 73.37) % 293).toFixed(2), y = ((i * 47.19) % 227).toFixed(2)
    return i % 4 === 0
      ? `<path d="M${x} ${y}q1.2 -.7 2.4 .2" fill="none" stroke="#705a36" stroke-width=".35"/>`
      : `<circle cx="${x}" cy="${y}" r=".3" fill="#705a36"/>`
  }).join('')
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="293" height="227"><g opacity="${.042 * Math.max(0, Math.min(1, strength))}">${marks}</g></svg>`)}")`
}

export function artisticMaterialStyle(theme: string, strength: number): CSSProperties {
  const family = skinFamily(theme)?.id
  const paper = family === 'paper', press = family === 'press', crt = family === 'terminal'
  const intensity = 'var(--wb-material-strength)'
  const defaults: Record<string, string> = {
    '--wb-surface-texture': 'none', '--wb-texture-size': 'auto', '--wb-panel-edge': 'none',
    '--wb-panel-radius': '12px', '--wb-user-edge': 'none', '--wb-status-edge': 'none',
    '--wb-user-radius': '16px', '--wb-user-surface': 'var(--wb-accent)', '--wb-user-text': 'var(--wb-sidebar)',
    '--wb-message-texture': 'none', '--wb-code-texture': 'none', '--wb-tool-texture': 'none',
    '--wb-composer-texture': 'none', '--wb-panel-texture': 'none', '--wb-user-texture': 'none',
    '--wb-tool-edge': 'none', '--wb-panel-surface': 'var(--wb-surface)',
    '--wb-composer-radius': 'var(--wb-composer-default-radius, 12px)', '--wb-message-rule': 'transparent',
    '--wb-panel-border-style': 'solid', '--wb-tool-border-style': 'solid',
    '--wb-code-border-style': 'solid', '--wb-tool-border': 'var(--wb-border)',
    '--wb-code-border': 'var(--wb-border)', '--wb-composer-border': 'var(--wb-border)',
    '--wb-status-texture': 'none', '--wb-status-surface': 'var(--wb-background)',
  }
  if (!family) return defaults as CSSProperties

  // 每个表面独立配方；光影只改变绘制，不增减 padding/border-width 或挂载业务节点。
  const ink = (opacity: number) => `rgb(35 37 31 / calc(${opacity} * ${intensity}))`
  const light = (opacity: number) => `rgb(232 243 255 / calc(${opacity} * ${intensity}))`
  const accent = (percent: number) => `color-mix(in srgb, var(--wb-accent) calc(${percent}% * ${intensity}), transparent)`
  const grain = `radial-gradient(${ink(.055)} .5px, transparent .8px)`
  const scan = `repeating-linear-gradient(0deg, transparent 0 3px, ${accent(4)} 3px 4px)`
  const brushed = `repeating-linear-gradient(100deg, transparent 0 2px, ${light(.035)} 2px 3px)`
  const reflection = `linear-gradient(145deg, ${light(.055)}, transparent 38% 70%, ${light(.025)})`
  const paperFace = `linear-gradient(120deg, rgb(255 255 255 / calc(.12 * ${intensity})), transparent 50%), ${paperFiber(strength)}`
  const texture = (value: string) => strength > 0 ? value : 'none'
  const edge = (value: string) => strength > 0 ? value : 'none'
  const ruled = `inset 0 1px ${ink(.65)}, inset 0 -1px ${ink(.25)}`
  const metalEdge = `inset 0 1px ${light(.55)}, inset 1px 0 ${light(.18)}, inset 0 -1px rgb(0 0 0 / calc(.65 * ${intensity})), 0 3px 7px rgb(0 0 0 / calc(.16 * ${intensity}))`
  return {
    ...defaults,
    '--wb-surface-texture': texture(paper ? paperFiber(strength) : press ? grain : crt ? scan : brushed),
    '--wb-canvas-texture': texture(paper ? paperFace : press ? grain : crt ? `${scan}, radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / calc(.3 * ${intensity})))` : `${reflection}, ${brushed}`),
    '--wb-texture-size': press ? '7px 7px' : 'auto',
    '--wb-message-surface': press || crt ? 'transparent' : 'var(--wb-surface)',
    '--wb-message-texture': texture(paper ? paperFace : press || crt ? 'none' : reflection),
    '--wb-message-radius': paper ? '3px 9px 5px 2px' : press || crt ? '0px' : '12px',
    '--wb-message-edge': edge(paper ? `inset 0 0 0 1px ${ink(.08)}, 2px 3px 0 var(--wb-raised), 0 5px 8px ${ink(.08)}` : press ? ruled : crt ? `inset 2px 0 ${accent(35)}` : metalEdge),
    '--wb-message-rule': press ? 'var(--wb-border)' : 'transparent',
    '--wb-code-surface': 'var(--wb-sidebar)',
    '--wb-code-texture': texture(paper ? paperFiber(strength * .4) : crt ? scan : press ? 'none' : brushed),
    '--wb-code-radius': paper || press ? '1px' : crt ? '3px' : '7px',
    '--wb-code-edge': edge(paper ? `inset 3px 0 ${ink(.2)}` : press ? `inset 0 2px ${ink(.5)}` : crt ? `inset 0 0 9px rgb(0 0 0 / calc(.4 * ${intensity}))` : `inset 0 1px rgb(0 0 0 / calc(.5 * ${intensity})), inset 0 -1px ${light(.2)}`),
    '--wb-code-border': crt ? accent(55) : 'var(--wb-border)',
    '--wb-tool-surface': press || crt ? 'transparent' : 'var(--wb-background)',
    '--wb-tool-texture': texture(paper ? paperFiber(strength * .3) : 'none'),
    '--wb-tool-radius': paper ? '2px' : press || crt ? '0px' : '6px',
    '--wb-tool-edge': edge(press ? `inset 3px 0 ${ink(.45)}` : crt ? `inset 2px 0 ${accent(45)}` : 'none'),
    '--wb-tool-border-style': paper ? 'dashed' : 'solid',
    '--wb-tool-border': press || crt ? 'transparent' : 'var(--wb-border)',
    '--wb-composer-surface': crt ? 'var(--wb-sidebar)' : 'var(--wb-surface)',
    '--wb-composer-texture': texture(paper ? paperFace : press ? 'none' : crt ? scan : reflection),
    '--wb-composer-radius': paper ? '4px 10px 7px 3px' : press ? '0px' : crt ? '5px' : '14px',
    '--wb-composer-border': crt ? accent(60) : 'var(--wb-border)',
    '--wb-material-shadow': edge(paper ? `0 3px 0 var(--wb-raised), 0 5px 8px ${ink(.08)}` : press ? `inset 0 3px ${ink(.7)}` : crt ? `inset 0 0 12px rgb(0 0 0 / calc(.5 * ${intensity})), 0 0 0 3px ${accent(9)}` : metalEdge),
    '--wb-user-surface': press ? 'var(--wb-raised)' : crt ? 'transparent' : paper ? 'var(--wb-accent)' : 'var(--wb-raised)',
    '--wb-user-text': paper ? 'var(--wb-surface)' : 'var(--wb-text)',
    '--wb-user-texture': texture(paper ? paperFiber(strength) : press || crt ? 'none' : reflection),
    '--wb-user-radius': paper ? '2px 5px 2px 7px' : press || crt ? '0px' : '10px',
    '--wb-user-edge': edge(paper ? `inset 0 1px rgb(255 255 255 / calc(.18 * ${intensity})), 1px 2px 0 var(--wb-border)` : press ? `inset 3px 0 ${ink(.5)}` : crt ? `inset 2px 0 ${accent(65)}` : metalEdge),
    '--wb-panel-texture': texture(paper ? paperFace : press ? grain : crt ? scan : `${reflection}, ${brushed}`),
    '--wb-panel-radius': paper ? '3px 8px 4px 2px' : press ? '0px' : crt ? '10px' : '16px',
    '--wb-panel-border-style': press ? 'double' : 'solid',
    '--wb-panel-edge': edge(paper ? `inset 0 0 0 3px var(--wb-raised), 3px 4px 0 var(--wb-sidebar)` : press ? `inset 0 4px ${ink(.8)}, inset 0 7px var(--wb-surface), inset 0 8px ${ink(.4)}` : crt ? `inset 0 0 0 3px var(--wb-sidebar), inset 0 0 0 4px ${accent(40)}, inset 0 0 25px rgb(0 0 0 / calc(.5 * ${intensity}))` : metalEdge),
    '--wb-status-surface': press || crt ? 'transparent' : 'var(--wb-surface)',
    '--wb-status-texture': texture(paper ? paperFiber(strength * .3) : press || crt ? 'none' : reflection),
    '--wb-status-edge': edge(press ? ruled : crt ? `inset 0 1px ${accent(40)}` : 'none'),
    '--wb-heading-font': press ? 'Georgia, "Noto Serif SC", "Songti SC", SimSun, serif' : 'inherit',
    '--wb-scheme': paper || press ? 'light' : 'dark',
    '--wb-composer-filter': 'none', '--wb-composer-opacity': '100%',
  } as CSSProperties
}
