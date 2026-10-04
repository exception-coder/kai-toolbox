import { useEffect, useState, type ComponentType } from 'react'
import { onOpenCommandPalette, openCommandPalette } from './commandPaletteBus'

/** Keep video search and its dependencies out of the initial workspace bundle. */
export function DeferredCommandPalette() {
  const [Palette, setPalette] = useState<ComponentType | null>(null)
  const [openAfterLoad, setOpenAfterLoad] = useState(false)

  useEffect(() => {
    if (Palette) return
    let loading = false
    const load = () => {
      if (loading) return
      loading = true
      import('./CommandPalette').then(module => {
        setPalette(() => module.CommandPalette)
        setOpenAfterLoad(true)
      }).catch(error => {
        loading = false
        console.error('命令面板加载失败', error)
      })
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        load()
      }
    }
    window.addEventListener('keydown', onKey)
    const unsubscribe = onOpenCommandPalette(load)
    return () => { window.removeEventListener('keydown', onKey); unsubscribe() }
  }, [Palette])

  useEffect(() => {
    if (!Palette || !openAfterLoad) return
    setOpenAfterLoad(false)
    const id = window.setTimeout(openCommandPalette, 0)
    return () => window.clearTimeout(id)
  }, [Palette, openAfterLoad])

  return Palette ? <Palette /> : null
}
