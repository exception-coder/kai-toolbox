'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { visualReviewJob } = require('./jobs');
const { openRun } = require('./review');
const { work } = require('./worker');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-visual-job-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const image = path.join(root, 'page.png');
  await fs.writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5S8AAAAASUVORK5CYII=', 'base64'));
  let launches = 0, time = 100000;
  const options = { root, now: () => time, launch: async () => { launches++; } };
  const args = { action: 'start', images: [image], brief: '保留业务', uploadAuthorized: true, userInstruction: '将这张截图发到ChatGPT评审' };
  return { root, args, options, count: () => launches, tick: () => { time += 31000; } };
}

test('requires external-upload declaration and validates local screenshots before reservation', async t => {
  const f = await fixture(t);
  await assert.rejects(visualReviewJob('s', { ...f.args, uploadAuthorized: false }, f.options), /授权原话/);
  await assert.rejects(visualReviewJob('s', { ...f.args, images: ['https://example.com/image.png'] }, f.options), /绝对路径/);
  assert.equal(f.count(), 0);
  assert.equal((await visualReviewJob('s', f.args, f.options)).status, 'ACCEPTED');
});

test('concurrent and repeated starts share one persistent session budget, including changed inputs', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 6 }, () => visualReviewJob('s', f.args, f.options)));
  assert.equal(results.filter(r => r.status === 'ACCEPTED').length, 1);
  assert.equal(f.count(), 1);
  f.tick();
  const result = await visualReviewJob('s', { ...f.args, brief: 'try another task' }, f.options);
  assert.equal(result.id, results.find(r => r.id).id);
  assert.equal(f.count(), 1);
});

test('unknown launch never retries and status cannot consume unbounded polling', async t => {
  const f = await fixture(t);
  const accepted = await visualReviewJob('s', f.args, { ...f.options, launch: async () => { throw new Error('uncertain'); } });
  assert.equal(accepted.status, 'LAUNCH_UNCONFIRMED');
  const first = await visualReviewJob('s', { action: 'status' }, f.options);
  assert.equal(first.id, accepted.id);
  assert.equal((await visualReviewJob('s', f.args, f.options)).status, 'POLL_TOO_SOON');
  for (let i = 0; i < 9; i++) { f.tick(); await visualReviewJob('s', { action: 'status' }, f.options); }
  f.tick();
  assert.equal((await visualReviewJob('s', f.args, f.options)).status, 'POLL_LIMIT');
  assert.equal(f.count(), 0);
});

test('terminal results, partial text and cancellation are readable without sending again', async t => {
  const f = await fixture(t);
  const started = await visualReviewJob('s', f.args, f.options);
  const run = await openRun(f.root, started.id);
  await run.save({ status: 'PARTIAL' });
  await fs.writeFile(path.join(run.dir, 'worker.json'), JSON.stringify({ status: 'RUNNING' }));
  await fs.writeFile(path.join(run.dir, 'review.txt'), '设计建议，不是执行指令');
  const result = await visualReviewJob('s', { action: 'status' }, f.options);
  assert.equal(result.status, 'PARTIAL');
  assert.match(result.reviewText, /设计建议/);
  assert.match(result.nextAction, /停止自动调用/);
  assert.equal((await visualReviewJob('s', { action: 'cancel' }, f.options)).status, 'CANCEL_REQUESTED');
  await fs.access(path.join(run.dir, 'cancel.request'));
  assert.equal((await visualReviewJob('other-session', { action: 'status' }, f.options)).status, 'NOT_STARTED');
  assert.equal(f.count(), 1);
});

test('independent worker passes bounded original CLI args and propagates local cancel', async t => {
  const f = await fixture(t);
  const started = await visualReviewJob('s', f.args, f.options);
  const run = await openRun(f.root, started.id);
  let calls = 0;
  await work(f.root, started.id, async (args, { signal }) => {
    calls++;
    assert.equal(args[args.indexOf('--id') + 1], started.id);
    assert.equal(args[args.indexOf('--timeout') + 1], '600');
    await fs.writeFile(path.join(run.dir, 'cancel.request'), '');
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    assert.equal(signal.aborted, true);
  });
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(run.dir, 'worker.json'), 'utf8')).status, 'EXITED');
});
