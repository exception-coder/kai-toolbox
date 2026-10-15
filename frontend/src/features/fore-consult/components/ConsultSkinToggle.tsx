import { useState } from 'react'
import { Palette } from 'lucide-react'

export type ConsultSkin = 'glass' | 'forge'
// 新偏好版本统一启用 Forge 默认值，不继承旧版玻璃选择；之后仍尊重个人选择。
const STORAGE_KEY = 'toolbox.fore-consult.skin.v2'

/** 仅保存本浏览器的外观偏好，不参与咨询对象、权限或服务端配置。 */
export function useConsultSkin() {
  const [skin, setSkin] = useState<ConsultSkin>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'glass' ? 'glass' : 'forge' }
    catch { return 'forge' }
  })
  const [remembered, setRemembered] = useState(true)
  function toggleSkin() {
    const next = skin === 'forge' ? 'glass' : 'forge'
    setSkin(next)
    try { localStorage.setItem(STORAGE_KEY, next); setRemembered(true) }
    catch { setRemembered(false) }
  }
  return { skin, toggleSkin, remembered }
}

export function ConsultSkinToggle({ skin, onToggle, remembered }: {
  skin: ConsultSkin; onToggle: () => void; remembered: boolean
}) {
  return <button type="button" className="fc-skin-toggle" aria-label="Forge 风格"
    aria-pressed={skin === 'forge'} onClick={onToggle}
    title={`${skin === 'forge' ? '切回原有玻璃风格' : '切换为 Forge 全站风格'}；${remembered ? '仅改变外观，本地记住选择' : '浏览器禁止保存偏好，本次选择仍生效'}`}>
    <Palette className="size-3.5" />
    <span>Forge 风格</span>
    {!remembered && <span role="status" className="text-[10px]">仅本次</span>}
  </button>
}
