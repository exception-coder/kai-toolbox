import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedUrl, readArticle, snapshotPage } from './procurement-capture.mjs';

test('collection permits registered HTTP hosts and rejects credentials and internal URLs', () => {
  const hosts = ['www.ggzy.gov.cn'];
  assert.equal(allowedUrl('https://www.ggzy.gov.cn/article', hosts), true);
  for (const url of ['file:///C:/secret', 'http://127.0.0.1/', 'https://www.ggzy.gov.cn@localhost/',
    'https://www.ggzy.gov.cn.evil.test/', 'https://www.ggzy.gov.cn:9999/']) {
    assert.equal(allowedUrl(url, hosts), false);
  }
});

test('article frame wins over longer platform navigation', async () => {
  const frame = (url, text) => ({ url: () => url, locator: () => ({ innerText: async () => text }) });
  const page = { frames: () => [frame('https://www.ggzy.gov.cn/html/a/a', '导航'.repeat(500)),
    frame('https://www.ggzy.gov.cn/html/b/a', '正文'.repeat(100))],
    locator: () => ({ evaluateAll: async () => [] }), title: async () => '公告', url: () => 'https://www.ggzy.gov.cn/html/a/a' };
  assert.equal((await readArticle(page, ['www.ggzy.gov.cn'])).text, '正文'.repeat(100));
});

test('empty or failed iframe is not reported as successful capture', async () => {
  await assert.rejects(readArticle({ frames: () => [] }, []), /有效正文/);
});

test('snapshot retains complete outer and iframe HTML, excluding unregistered hosts', async () => {
  const frame = url => ({ url: () => url, content: async () => '<html>完整正文</html>',
    locator: () => ({ innerText: async () => '正文' }) });
  const result = await snapshotPage({ content: async () => '<html><iframe></iframe></html>',
    frames: () => [frame('https://www.ggzy.gov.cn/b'), frame('https://other.test/b')] }, ['www.ggzy.gov.cn']);
  assert.equal(result.html, '<html><iframe></iframe></html>');
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].html, '<html>完整正文</html>');
});
