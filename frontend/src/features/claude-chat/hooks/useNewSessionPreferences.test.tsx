import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNewSessionPreferences } from './useNewSessionPreferences'
import { loadNewSessionPreferences, newSessionPreferenceKey, newSessionSelectionIssue, resolveNewSessionWorkspace, saveNewSessionPreferences } from '../lib/newSessionPreferences'
import type { ProviderProfile } from '../providerProfiles'

const gateway: ProviderProfile = { id: 'gateway', name: '测试服务商', baseUrl: 'https://gateway.invalid',
  model: 'current-model', hasKey: true }
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('new session local preferences', () => {
  it('remembers confirmed choices, restores after remount and saves only allowlisted fields', () => {
    const first = renderHook(() => useNewSessionPreferences(11, [gateway]))
    act(() => { first.result.current.setCwd('D:/work/kai-toolbox'); first.result.current.setEngine('codex'); first.result.current.setProviderId('gateway') })
    expect(localStorage.getItem(newSessionPreferenceKey(11))).toBeNull()
    expect(first.result.current.choice.model).toBe('current-model')
    act(() => first.result.current.remember('D:/work'))
    const stored = JSON.parse(localStorage.getItem(newSessionPreferenceKey(11))!)
    expect(stored).toEqual({ version: 1, cwd: 'D:/work/kai-toolbox', workspaceRoot: 'D:/work', engine: 'codex', providerId: 'gateway' })
    first.unmount()
    const second = renderHook(() => useNewSessionPreferences(11, [gateway]))
    expect(second.result.current.choice).toMatchObject(loadNewSessionPreferences(11).value)
  })

  it('isolates owners and ignores callbacks from the previous owner', () => {
    saveNewSessionPreferences(11, { workspaceRoot: 'D:/first', cwd: 'D:/first/project', engine: 'codex', providerId: '' })
    const hook = renderHook(({ owner }) => useNewSessionPreferences(owner, []), { initialProps: { owner: 11 } })
    const old = hook.result.current
    hook.rerender({ owner: 22 })
    act(() => { old.setCwd('D:/late'); old.remember('D:/late') })
    expect(hook.result.current.choice.cwd).toBe('')
    expect(localStorage.getItem(newSessionPreferenceKey(22))).toBeNull()
    expect(loadNewSessionPreferences(11).value.cwd).toBe('D:/first/project')
  })

  it('keeps a pending provider and does not overwrite manual models when the profile arrives', () => {
    saveNewSessionPreferences(11, { workspaceRoot: '', cwd: '', engine: 'codex', providerId: 'gateway' })
    const hook = renderHook(({ profiles }) => useNewSessionPreferences(11, profiles),
      { initialProps: { profiles: [] as ProviderProfile[] } })
    expect(hook.result.current.choice.providerId).toBe('gateway')
    act(() => hook.result.current.setModel('manual-model'))
    hook.rerender({ profiles: [gateway] })
    expect(hook.result.current.choice.model).toBe('manual-model')
    const evidence = { engines: ['codex' as const], enginesLoading: false, providers: [], providersLoading: true, providersFailed: false }
    expect(newSessionSelectionIssue(hook.result.current.choice, evidence)).toContain('正在读取')
    expect(newSessionSelectionIssue(hook.result.current.choice, { ...evidence, providersLoading: false })).toContain('已不可用')
    expect(hook.result.current.choice.providerId).toBe('gateway')
  })

  it('matches reordered Windows roots and does not substitute a removed root', () => {
    const roots = [{ root: 'D:/other', exists: true, dirs: [] }, { root: 'D:/work', exists: true, dirs: [] }]
    expect(resolveNewSessionWorkspace(roots, 'd:\\WORK\\')?.root).toBe('D:/work')
    expect(resolveNewSessionWorkspace(roots, 'D:/removed')).toBeNull()
    expect(resolveNewSessionWorkspace(roots, '')?.root).toBe('D:/other')
  })

  it('recovers from corrupt storage and continues in memory when writes are denied', () => {
    localStorage.setItem(newSessionPreferenceKey(11), '{invalid')
    expect(loadNewSessionPreferences(11)).toMatchObject({ value: { engine: 'claude' }, warning: expect.any(String) })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const hook = renderHook(() => useNewSessionPreferences(11, []))
    act(() => { hook.result.current.setEngine('codex'); hook.result.current.setCwd('D:/work'); hook.result.current.remember('D:/work') })
    expect(hook.result.current.choice.cwd).toBe('D:/work')
    expect(hook.result.current.warning).toContain('未允许保存')
  })
})
