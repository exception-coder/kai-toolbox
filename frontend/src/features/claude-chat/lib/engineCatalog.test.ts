import { describe, expect, it } from 'vitest'
import { selectableEngineIds } from './engineCatalog'
import type { EngineCatalogView } from '../types'

describe('selectableEngineIds', () => {
  it('falls back to stable engines when the sidecar catalog is unavailable', () => {
    expect(selectableEngineIds({ protocolVersion: 1, engines: [], error: 'offline' }))
      .toEqual(['claude', 'codex', 'opencode'])
  })

  it('only exposes DeepSeek Harness after a ready handshake', () => {
    const catalog: EngineCatalogView = {
      protocolVersion: 1,
      engines: [
        {
          id: 'claude', displayName: 'Claude Code', capabilities: [], availability: 'stable', selectable: true,
          probe: { status: 'ready' },
        },
        {
          id: 'deepseekHarness', displayName: 'DeepSeek Harness', capabilities: [], availability: 'experimental', selectable: true,
          probe: { status: 'ready', runtimeVersion: '0.1.0' },
        },
      ],
    }
    expect(selectableEngineIds(catalog)).toEqual(['claude', 'deepseekHarness'])
    catalog.engines[1].probe.status = 'incompatible'
    expect(selectableEngineIds(catalog)).toEqual(['claude'])
  })

  it('exposes Antigravity only when the sidecar probe marks it selectable', () => {
    const catalog: EngineCatalogView = {
      protocolVersion: 1,
      engines: [
        {
          id: 'antigravity', displayName: 'Antigravity', capabilities: [], availability: 'stable', selectable: false,
          probe: { status: 'incompatible', runtimeVersion: '1.1.1' },
        },
      ],
    }
    expect(selectableEngineIds(catalog)).toEqual(['claude', 'codex', 'opencode'])
    catalog.engines[0].selectable = true
    catalog.engines[0].probe.status = 'ready'
    expect(selectableEngineIds(catalog)).toEqual(['antigravity'])
  })
})
