import { useEffect, useMemo, useRef, useState } from 'react'
import type { Engine } from '../types'
import type { ProviderProfile } from '../providerProfiles'
import { loadNewSessionPreferences, saveNewSessionPreferences, type NewSessionPreferences } from '../lib/newSessionPreferences'
import { supportsSessionProvider } from '../lib/engineCatalog'

interface Draft extends NewSessionPreferences { model: string; modelEdited: boolean }

/** 手动新建选择即时记忆；程序填充和服务商凭据不进入新存储。 */
export function useNewSessionPreferences(userId: number | undefined, profiles: ProviderProfile[]) {
  const loaded = useMemo(() => loadNewSessionPreferences(userId), [userId])
  const seed = useMemo(() => ({ userId, value: { ...loaded.value, model: '', modelEdited: false } as Draft,
    warning: loaded.warning }), [loaded, userId])
  const [state, setState] = useState(seed)
  const owner = useRef(userId)
  const pendingSelection = useRef<{ userId: number | undefined } | null>(null)
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
  useEffect(() => {
    const pending = pendingSelection.current
    if (!pending) return
    pendingSelection.current = null
    if (pending.userId !== userId || state.userId !== userId) return
    const warning = saveNewSessionPreferences(userId, state.value)
    if (warning !== state.warning) setState(previous => previous.userId === userId ? { ...previous, warning } : previous)
  }, [state, userId])
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
    select: (change: Partial<NewSessionPreferences>) => {
      if (owner.current !== userId) return
      const draft: Partial<Draft> = { ...change }
      if (change.providerId !== undefined) Object.assign(draft, { model: '', modelEdited: false })
      if (change.engine && !supportsSessionProvider(change.engine)) {
        Object.assign(draft, { providerId: '', model: '', modelEdited: false })
      }
      pendingSelection.current = { userId }
      update(draft)
    },
    remember: (workspaceRoot: string) => {
      if (owner.current !== userId) return
      const warning = saveNewSessionPreferences(userId, { ...current.value, workspaceRoot })
      setState(previous => ({ ...(previous.userId === userId ? previous : seed), warning }))
    },
  }
}
