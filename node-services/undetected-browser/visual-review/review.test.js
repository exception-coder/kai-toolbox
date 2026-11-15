'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRun, openRun, submit, collect, conversationUrl, ChatGptPage } = require('./review');
const { parseArgs } = require('./cli');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-visual-review-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const image = path.join(root, 'input.png');
  await fs.writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5S8AAAAASUVORK5CYII=', 'base64'));
  const run = await createRun(root, [image], '保留业务功能');
  return { root, image, run };
}

test('reuses request identity, rejects conflicting input and unsafe resume URL', async t => {
  const { root, image, run } = await fixture(t);
  await run.save({ status: 'SUBMITTED', submissionAttempted: true });
  assert.equal((await createRun(root, [image], '保留业务功能', run.state.id)).state.status, 'SUBMITTED');
  await assert.rejects(createRun(root, [image], '不同要求', run.state.id), /不同/);
  await assert.rejects(openRun(root, '../other'), /UUID/);
  assert.throws(() => conversationUrl('https://example.com/c/id'), /会话地址/);
  assert.throws(() => conversationUrl('https://chatgpt.com/'), /会话地址/);
});

test('rejects non-image input and changed screenshot before upload', async t => {
  const { root, image, run } = await fixture(t);
  await fs.writeFile(image, 'not an image');
  await assert.rejects(createRun(root, [image], ''), /PNG/);
  await assert.rejects(submit({ ready: async () => true }, run), /变化/);
  assert.equal(run.state.submissionAttempted, false);
});

test('requires login without uploading or submitting', async t => {
  const { run } = await fixture(t);
  assert.equal(await submit({ ready: async () => false }, run), false);
  assert.equal(run.state.status, 'AUTH_REQUIRED');
  assert.equal(run.state.submissionAttempted, false);
});

test('persists intent before clicking and refuses uncertain replay', async t => {
  const { root, run } = await fixture(t);
  let calls = 0;
  const adapter = { ready: async () => true, upload: async () => {}, compose: async () => {}, send: async () => {
    calls++;
    assert.equal((await openRun(root, run.state.id)).state.submissionAttempted, true);
    throw new Error('click timed out');
  } };
  await assert.rejects(submit(adapter, run), /timed out/);
  assert.equal(run.state.status, 'SEND_UNCONFIRMED');
  await assert.rejects(submit(adapter, run), /禁止/);
  assert.equal(calls, 1);
});

test('cancellation prevents sending and preserves collection recovery', async t => {
  const { run } = await fixture(t);
  const controller = new AbortController();
  controller.abort();
  const adapter = { ready: async () => true, upload: async () => {}, compose: async () => {}, send: async () => assert.fail('must not send') };
  assert.equal(await submit(adapter, run, { signal: controller.signal }), false);
  assert.equal(run.state.status, 'CANCELLED_BEFORE_SEND');
  assert.equal(run.state.submissionAttempted, false);
  assert.equal((await collect({}, run, { signal: controller.signal })).status, 'CANCELLED');
});

test('text without generated image remains partial with a recoverable conversation', async t => {
  const { run } = await fixture(t);
  const adapter = { snapshot: async () => ({ url: 'https://chatgpt.com/c/example', matched: true,
    text: '优化建议：压缩目录层级，保留完整文件名。', busy: false, finished: true, generated: [] }) };
  const result = await collect(adapter, run, { timeoutMs: 40, pollMs: 5 });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.conversationUrl, 'https://chatgpt.com/c/example');
  assert.match(await fs.readFile(path.join(run.dir, 'review.txt'), 'utf8'), /优化建议/);
  assert.deepEqual(result.artifacts, []);
});

test('validates bounded CLI arguments', () => {
  assert.throws(() => parseArgs(['review']), /image/);
  assert.throws(() => parseArgs(['collect']), /id/);
  assert.throws(() => parseArgs(['login', '--timeout', 'Infinity']), /1800/);
  assert.throws(() => parseArgs(['review', '--url', 'https://example.com']), /无效/);
  assert.throws(() => parseArgs(['collect', '--id', 'unused', '--conversation-url', 'https://example.com/c/id']), /会话地址/);
});

test('isolated browser uploads and submits once, captures generated images but excludes avatars', async t => {
  const { run } = await fixture(t);
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="white"/><text x="20" y="40">UI FIXTURE</text></svg>');
  await page.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><main>
    <form><input type="file" accept="image/*"><div id="prompt-textarea" contenteditable="true"></div>
    <button type="button" data-testid="send-button" disabled>Send</button></form><section id="turns">
    <article><div data-message-author-role="user">unrelated previous task</div></article>
    <article><div data-message-author-role="assistant">Old result must not be exported</div><img alt="Generated image" src="${svg}"></article></section>
    <script>
    const imageUrl = ${JSON.stringify(svg)};
    document.querySelector('input').onchange = () => {
      const img = new Image(); img.src = imageUrl; document.querySelector('form').append(img);
      document.querySelector('button').disabled = false;
    };
    document.querySelector('button').onclick = () => {
      const turns = document.querySelector('#turns');
      const user = document.createElement('article');
      const content = document.createElement('div'); content.dataset.messageAuthorRole = 'user';
      content.textContent = document.querySelector('#prompt-textarea').innerText;
      user.append(content); turns.append(user);
      const assistant = document.createElement('article');
      assistant.innerHTML = '<div data-message-author-role="assistant">优化方案：压缩目录，统一操作，保留原有业务功能。</div><button data-testid="copy-turn-action-button">复制</button>';
      const image = new Image(); image.src = imageUrl; image.alt = 'Generated image'; assistant.append(image);
      const icon = new Image(); icon.src = imageUrl; icon.alt = 'Avatar'; assistant.append(icon);
      turns.append(assistant); history.pushState({}, '', '/c/fixture-conversation');
    };
    </script></main>` }));
  await page.goto('https://chatgpt.com/');
  const adapter = new ChatGptPage(page);
  assert.equal(await submit(adapter, run), true);
  const result = await collect(adapter, run, { timeoutMs: 12000, pollMs: 100 });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].originalDownload, false);
  assert.equal(await page.locator('[data-message-author-role="user"]').count(), 2);
  assert.doesNotMatch(result.reviewText, /Old result/);
  assert.equal((await fs.readFile(path.join(run.dir, result.artifacts[0].file))).toString('hex', 0, 8), '89504e470d0a1a0a');
});
