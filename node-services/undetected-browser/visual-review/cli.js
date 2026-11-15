#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { ORIGIN, ChatGptPage, createRun, openRun, conversationUrl, submit, collect, pause } = require('./review');

function parseArgs(argv) {
  const [command = 'help', ...args] = argv;
  if (!['help', 'login', 'review', 'collect', 'status'].includes(command)) throw new Error('未知命令');
  const options = { command, images: [], dataDir: path.join(os.homedir(), '.kai-toolbox', 'chatgpt-visual-review'), timeout: 600 };
  const allowed = new Set(['--image', '--id', '--brief-file', '--data-dir', '--timeout', '--conversation-url']);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!allowed.has(key) || !value || value.startsWith('--')) throw new Error(`无效参数：${key}`);
    if (key === '--image') options.images.push(path.resolve(value));
    else if (key === '--id') options.id = value;
    else if (key === '--brief-file') options.briefFile = path.resolve(value);
    else if (key === '--data-dir') options.dataDir = path.resolve(value);
    else if (key === '--conversation-url') options.conversationUrl = conversationUrl(value);
    else options.timeout = Number(value);
  }
  if (!Number.isInteger(options.timeout) || options.timeout < 10 || options.timeout > 1800) throw new Error('--timeout 为 10～1800 秒');
  if (['collect', 'status'].includes(command) && !options.id) throw new Error('需要 --id');
  if (command === 'review' && !options.images.length) throw new Error('需要 --image');
  if (options.conversationUrl && command !== 'collect') throw new Error('--conversation-url 仅供 collect 恢复');
  return options;
}

async function main(argv, { signal } = {}) {
  const options = parseArgs(argv);
  if (options.command === 'help') {
    console.log('ChatGPT 网页视觉评审实验（不是官方 API）\nlogin\nreview --image <截图> [--image <截图>] [--id <UUID>] [--brief-file <要求.txt>]\ncollect --id <UUID> [--conversation-url <原对话URL>]\nstatus --id <UUID>\n可选 --timeout <10～1800秒> --data-dir <本地私有目录>');
    return;
  }
  let run;
  if (options.command === 'review') {
    const brief = options.briefFile ? await fs.readFile(options.briefFile, 'utf8') : '';
    if (brief.length > 12000) throw new Error('补充要求不能超过 12000 字符');
    run = await createRun(options.dataDir, options.images, brief, options.id || randomUUID());
    console.log(JSON.stringify({ id: run.state.id, outputDirectory: run.dir, status: run.state.status }));
  } else if (options.command !== 'login') run = await openRun(options.dataDir, options.id);
  if (options.conversationUrl) {
    if (!run.state.submissionAttempted) throw new Error('尚未尝试发送的任务不能绑定恢复地址');
    // Read-only recovery still requires matching the run marker before exporting any content.
    await run.save({ conversationUrl: options.conversationUrl });
  }
  if (options.command === 'status' || run?.state.status === 'COMPLETED') {
    console.log(JSON.stringify(run.state));
    return;
  }
  if (run?.state.submissionAttempted && !run.state.conversationUrl) {
    console.log(JSON.stringify({ ...run.state, message: '已尝试发送但未取得会话地址；核对浏览器任务编号后用 collect --conversation-url <原对话URL> 恢复，不自动重发。' }));
    process.exitCode = 2;
    return;
  }
  await fs.mkdir(options.dataDir, { recursive: true, mode: 0o700 });
  const lockFile = path.join(options.dataDir, 'browser.lock');
  let lock;
  try { lock = await fs.open(lockFile, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('该浏览器目录已有任务或遗留锁；先核对 browser.lock 中的 PID，确认进程已退出后再手动移除锁。');
    throw error;
  }
  await lock.writeFile(JSON.stringify({ pid: process.pid, runId: run?.state.id || null }));
  let context;
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const { chromium } = require('patchright');
    context = await chromium.launchPersistentContext(path.join(options.dataDir, 'profile'), {
      channel: 'chrome', headless: false, acceptDownloads: true, viewport: { width: 1440, height: 1000 },
    });
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(run?.state.conversationUrl ? conversationUrl(run.state.conversationUrl) : `${ORIGIN}/`, {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    const adapter = new ChatGptPage(page);
    if (options.command === 'login') {
      console.log('请在独立浏览器中登录 ChatGPT；脚本不会读取密码、导出 Cookie 或处理验证码。');
      const deadline = Date.now() + options.timeout * 1000;
      while (Date.now() < deadline && !abort.signal.aborted) {
        if (await adapter.ready()) { console.log(JSON.stringify({ status: 'LOGIN_READY', message: '已识别登录后输入框；尚未验证图片生成权限。' })); return; }
        await pause(1500);
      }
      console.log(JSON.stringify({ status: abort.signal.aborted ? 'CANCELLED' : 'AUTH_REQUIRED' }));
      process.exitCode = 2;
      return;
    }
    if (options.command === 'review' && !run.state.submissionAttempted) {
      // Navigate to the root and verify there is no existing conversation before uploading.
      if (!['/', ''].includes(new URL(page.url()).pathname)) throw new Error('未进入空白新会话，停止发送');
      if (await page.locator('[data-message-author-role="user"]').count()) throw new Error('页面含已有消息，停止发送');
      if (!await submit(adapter, run, { signal: abort.signal })) { console.log(JSON.stringify(run.state)); process.exitCode = 2; return; }
    } else if (!run.state.submissionAttempted) throw new Error('此任务尚未发送，不能 collect');
    const result = await collect(adapter, run, { timeoutMs: options.timeout * 1000, signal: abort.signal });
    await page.screenshot({ path: path.join(run.dir, 'page-evidence.png'), fullPage: true });
    console.log(JSON.stringify(result));
    if (result.status !== 'COMPLETED') process.exitCode = 2;
  } catch (error) {
    if (run) {
      if (!['SEND_UNCONFIRMED', 'CANCELLED'].includes(run.state.status)) await run.save({
        status: run.state.submissionAttempted ? 'RESULT_UNCONFIRMED' : 'FAILED_BEFORE_SEND', message: error.message,
      });
      // Preserve a recoverable conversation URL even if collection failed.
      const page = context?.pages()[0];
      if (page) {
        try { await run.save({ conversationUrl: conversationUrl(page.url()) }); } catch { /* No confirmed conversation URL. */ }
        try { await page.screenshot({ path: path.join(run.dir, 'page-evidence.png') }); } catch { /* Browser may be closed. */ }
      }
    }
    throw error;
  } finally {
    try { await context?.close(); }
    finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      signal?.removeEventListener('abort', cancel);
      await lock.close();
      await fs.unlink(lockFile);
    }
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(JSON.stringify({ status: 'FAILED', message: error.message }));
  process.exitCode = 1;
});
module.exports = { main, parseArgs };
