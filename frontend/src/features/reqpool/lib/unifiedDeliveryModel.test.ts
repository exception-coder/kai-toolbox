import { describe, expect, it } from 'vitest'
import type { DeliveryRequirement } from '@/features/delivery-center/public-api'
import type { ReqItemView } from '../types'
import { filterUnifiedRequirements, groupUnifiedRequirements, unifyRequirements } from './unifiedDeliveryModel'

const item = (id: string, prdSessionId: string | null) => ({ id, title: id, prdSessionId, project: 'ERP', module: '订单', status: 'DRAFT' } as ReqItemView)
const delivery = (id: string) => ({ id, title: id, project: 'ERP', module: '订单', parentId: null } as DeliveryRequirement)

describe('unified delivery identities', () => {
  it('keeps early requirements and orphan PRDs, collapsing only explicit links', () => {
    const entries = unifyRequirements([item('linked', 'prd-1'), item('early', null)], [delivery('prd-1'), delivery('prd-2')])
    expect(entries.map(e => e.key)).toEqual(['req:linked', 'req:early', 'prd:prd-2'])
    expect(entries[0].delivery?.id).toBe('prd-1')
    expect(entries[1].delivery).toBeUndefined()
    expect(entries[2].item).toBeUndefined()
  })
  it('does not silently delete real duplicate associations or entries when evidence is down', () => {
    expect(unifyRequirements([item('a', 'prd'), item('b', 'prd')], [delivery('prd')])).toHaveLength(2)
    expect(unifyRequirements([item('a', 'prd')], [])[0].key).toBe('req:a')
    expect(unifyRequirements([], [])).toEqual([])
  })
  it('preserves parent context and scopes project/module groups without collisions', () => {
    const rows = unifyRequirements([], [delivery('parent'), { ...delivery('child'), parentId: 'parent' }, { ...delivery('other'), project: 'SCM' }])
    expect(rows[1].parentTitle).toBe('parent')
    expect(groupUnifiedRequirements(rows)).toHaveLength(2)
    expect(filterUnifiedRequirements(rows, 'ERP', 'child', 'UNREGISTERED').map(e => e.key)).toEqual(['prd:child'])
  })
  it('searches owners and does not manufacture a persisted ID for an orphan', () => {
    const rows = unifyRequirements([{ ...item('a', null), assignee: '张凯' }], [delivery('p')])
    expect(filterUnifiedRequirements(rows, '', '张凯', '').map(e => e.item?.id)).toEqual(['a'])
    expect(filterUnifiedRequirements(rows, '', '', 'DRAFT')).toHaveLength(1)
    expect(filterUnifiedRequirements(rows, '', '不存在', '')).toEqual([])
  })
})
