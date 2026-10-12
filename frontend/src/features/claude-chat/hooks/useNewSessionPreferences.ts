import { useEffect, useMemo, useRef, useState } from 'react'
import type { Engine } from '../types'
import type { ProviderProfile } from '../providerProfiles'
import { loadNewSessionPreferences, saveNewSessionPreferences, type NewSessionPreferences } from '../lib/newSessionPreferences'
import { supportsSessionProvider } from '../lib/engineCatalog'

interface Draft extends NewSessionPreferences { model: string; modelEdited: boolean }

/** 新建表单的本地默认值；仅“开始会话”写入，不保存取消的表单或服务商凭据。 */
export function useNewSessionPreferences(userId: number | undefined, profiles: ProviderProfile[]) {
  const loaded = useMemo(() => loadNewSessionPreferences(userId), [userId])
  const seed = useMemo(() => ({ userId, value: { ...loaded.value, model: '', modelEdited: false } as Draft,
    warning: loaded.warning }), [loaded, userId])
  const [state, setState] = useState(seed)
  const owner = useRef(userId)
  owner.current = userId
  const current = state.userId === userId ? state : seed
  useEffect(() => { setState(previous => previous.userId === userId ? previous : seed) }, [seed, userId])
  useEffect(() => {
    const profile = profiles.find(item => item.id === current.value.providerId)
    if (!profile) return
    setState(previous => {
      if (previous.userId !== userId || previous.value.providerId !== profile.id
        || previous.value.modelEdited || previous.value.model === profile.model) return previous
      return { ...previous, value: { ...previous.value, model: profile.model || '' } }
    })
  }, [profiles, current.value.providerId, userId])
  const update = (change: Partial<Draft>) => setState(previous => {
    if (owner.current !== userId) return previous
    const base = previous.userId === userId ? previous : seed
    return { ...base, value: { ...base.value, ...change } }
  })
  return {
    choice: current.value,
    warning: current.warning,
    setCwd: (cwd: string) => update({ cwd }),
    setWorkspaceRoot: (workspaceRoot: string) => update({ workspaceRoot }),
    setEngine: (engine: Engine) => update({
      engine, ...(!supportsSessionProvider(engine) ? { providerId: '', model: '', modelEdited: false } : {}),
    }),
    setProviderId: (providerId: string) => update({ providerId, model: '', modelEdited: false }),
    setModel: (model: string) => update({ model, modelEdited: true }),
    remember: (workspaceRoot: string) => {
      if (owner.current !== userId) return
      const warning = saveNewSessionPreferences(userId, { ...current.value, workspaceRoot })
      setState(previous => ({ ...(previous.userId === userId ? previous : seed), warning }))
    },
  }
}
