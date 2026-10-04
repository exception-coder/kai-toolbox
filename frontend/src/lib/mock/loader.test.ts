import { expect, it } from 'vitest'
import { featuresWithMock, loadFeatureMocks } from './loader'
import { matchHttp } from './registry'

it('loads feature mock handlers before mock mode starts using them', async () => {
  expect(featuresWithMock.has('hosts')).toBe(true)
  await loadFeatureMocks()
  const route = matchHttp('GET', '/hosts')
  expect(route).not.toBeNull()
  expect(await route!.handler({ method: 'GET', path: '/hosts', params: {}, query: new URLSearchParams(), body: null })).toEqual([])
})
