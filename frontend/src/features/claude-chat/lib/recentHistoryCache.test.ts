import { describe, expect, it } from 'vitest'
import { RecentHistoryCache, type RecentHistoryPage } from './recentHistoryCache'

const page = (text: string): RecentHistoryPage => ({
  items: [{ kind: 'assistant', id: 'h1', text }], nextBefore: 12,
})

describe('最近消息缓存', () => {
  it('按会话保存正文与分页游标，登录凭据变化后不可复用', () => {
    const cache = new RecentHistoryCache()
    cache.put('login-a', 'a', page('会话 A'))
    cache.put('login-a', 'b', page('会话 B'))
    expect(cache.get('login-a', 'a')).toEqual(page('会话 A'))
    expect(cache.get('login-b', 'a')).toBeUndefined()
    expect(cache.get('login-a', 'b')).toBeUndefined()
    cache.put(null, 'a', page('公开会话'))
    expect(cache.get(null, 'a')).toBeUndefined()
  })

  it('只保留有限最近会话，访问会更新淘汰顺序', () => {
    const cache = new RecentHistoryCache(4096, 2)
    cache.put('login', 'a', page('A'))
    cache.put('login', 'b', page('B'))
    cache.get('login', 'a')
    cache.put('login', 'c', page('C'))
    expect(cache.get('login', 'b')).toBeUndefined()
    expect(cache.get('login', 'a')).toBeDefined()
  })

  it('更新最新页，过期或超大页不继续展示旧快照', () => {
    const cache = new RecentHistoryCache(1024, 8, 100)
    cache.put('login', 'a', page('旧'), 0)
    cache.put('login', 'a', page('新'), 50)
    expect(cache.get('login', 'a', 149)).toEqual(page('新'))
    expect(cache.get('login', 'a', 150)).toBeUndefined()
    cache.put('login', 'a', page('旧'), 151)
    cache.put('login', 'a', page('长'.repeat(1024)), 152)
    expect(cache.get('login', 'a', 153)).toBeUndefined()
  })

  it('跨会话正文总量超过预算时淘汰最早缓存', () => {
    const one = page('一条消息')
    const cache = new RecentHistoryCache(JSON.stringify(one).length * 2 + 5)
    cache.put('login', 'a', one)
    cache.put('login', 'b', one)
    expect(cache.get('login', 'a')).toBeUndefined()
    expect(cache.get('login', 'b')).toEqual(one)
  })
})
