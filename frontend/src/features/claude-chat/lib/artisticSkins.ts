import type { CSSProperties } from 'react'

export const ARTISTIC_SKINS = [
  { id: 'atelier-paper', name: 'Atelier Paper', description: '手工纸工坊 · 纤维与叠页', colors: ['#eee5d2', '#faf3e4', '#e7dcc6', '#e2d6bf', '#a49476', '#342b22', '#594b3b', '#664323', '#713b2d', '#365131'] },
  { id: 'editorial-press', name: 'Editorial Press', description: '复古报刊 · 油墨与校样', colors: ['#e8e5dc', '#f6f3eb', '#dfdcd2', '#d9d5c9', '#929083', '#23251f', '#484a40', '#344e53', '#753a32', '#375038'] },
  { id: 'amber-crt', name: 'Amber CRT', description: '琥珀终端 · 扫描线与屏框', colors: ['#16130e', '#201b13', '#100f0b', '#2c251a', '#776343', '#f6e3bc', '#d6bc8c', '#f2c36b', '#f3d5a0', '#d4d99a'] },
  { id: 'liquid-titanium', name: 'Liquid Titanium', description: '液态钛金 · 拉丝与冷光', colors: ['#20252b', '#2a3038', '#191e24', '#353c45', '#71808f', '#f0f3f6', '#c1cbd5', '#b8d8eb', '#e0c8de', '#b8dfd1'] },
] as const

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
  const active = ARTISTIC_SKINS.some(skin => skin.id === theme)
  const paper = theme === 'atelier-paper', press = theme === 'editorial-press'
  const crt = theme === 'amber-crt', metal = theme === 'liquid-titanium'
  const intensity = 'var(--wb-material-strength)'
  const texture = strength <= 0 ? 'none' : paper ? paperFiber(strength)
    : press ? `radial-gradient(rgb(35 37 31 / calc(.14 * ${intensity})) .55px, transparent .8px)`
      : crt ? `repeating-linear-gradient(0deg, transparent 0 3px, rgb(242 195 107 / calc(.055 * ${intensity})) 3px 4px)`
        : metal ? `repeating-linear-gradient(95deg, transparent 0 2px, rgb(210 225 237 / calc(.055 * ${intensity})) 2px 3px)` : 'none'
  const edge = paper ? `inset 0 0 0 1px rgb(102 67 35 / calc(.07 * ${intensity})), 0 1px 3px rgb(102 67 35 / calc(.04 * ${intensity}))`
    : press ? `inset 0 1px rgb(35 37 31 / calc(.65 * ${intensity})), inset 0 -3px rgb(35 37 31 / calc(.2 * ${intensity}))`
      : crt ? `inset 0 0 0 1px rgb(242 195 107 / calc(.38 * ${intensity})), inset 0 0 12px rgb(0 0 0 / calc(.3 * ${intensity}))`
        : metal ? `inset 0 1px rgb(232 243 255 / calc(.5 * ${intensity})), inset 0 -1px rgb(0 0 0 / calc(.65 * ${intensity}))` : 'none'
  const defaults = {
    '--wb-surface-texture': 'none', '--wb-texture-size': 'auto', '--wb-panel-edge': 'none',
    '--wb-panel-radius': '12px', '--wb-user-edge': 'none', '--wb-status-edge': 'none',
    '--wb-user-radius': '16px', '--wb-user-surface': 'var(--wb-accent)', '--wb-user-text': 'var(--wb-sidebar)',
  }
  if (!active) return defaults as CSSProperties
  return {
    ...defaults,
    '--wb-surface-texture': paper ? paperFiber(strength * .5) : texture, '--wb-canvas-texture': texture,
    '--wb-texture-size': press ? '5px 5px' : 'auto',
    '--wb-message-surface': 'var(--wb-surface)', '--wb-code-surface': 'var(--wb-sidebar)',
    '--wb-tool-surface': 'var(--wb-background)', '--wb-composer-surface': 'var(--wb-surface)',
    '--wb-message-radius': paper ? '8px' : press ? '0px' : crt ? '6px' : '10px',
    '--wb-code-radius': paper || press ? '2px' : '6px', '--wb-tool-radius': press ? '0px' : '4px',
    '--wb-panel-radius': paper ? '4px' : press ? '2px' : crt ? '8px' : '12px',
    '--wb-user-radius': paper ? '2px 6px 3px 2px' : press ? '0px' : '8px',
    '--wb-message-edge': edge, '--wb-code-edge': edge, '--wb-material-shadow': edge,
    '--wb-panel-edge': edge, '--wb-user-edge': paper ? 'none' : edge, '--wb-status-edge': paper ? 'none' : edge,
    '--wb-heading-font': press ? 'Georgia, "Noto Serif SC", "Songti SC", SimSun, serif' : 'inherit',
    '--wb-scheme': paper || press ? 'light' : 'dark',
    '--wb-composer-filter': 'none', '--wb-composer-opacity': '100%',
  } as CSSProperties
}
