'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const ORIGIN = 'https://chatgpt.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function conversationUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || !/^\/c\/[a-z0-9-]+$/i.test(url.pathname)) {
    throw new Error('尚无可恢复的 ChatGPT 会话地址；请在浏览器中核对已发送记录，禁止自动重发。');
  }
  return url.origin + url.pathname;
}

function buildPrompt(id, brief = '') {
  return `任务编号：forge-visual-review:${id}
请以资深产品设计师身份评审所附页面截图，使用中文，完成下面两项交付：
一、文字优化方案：先概括页面用途，再按 P0/P1 列出具体问题、修改办法和保留约束；重点检查信息层级、密度、字体、间距、配色、长文本和手机触控。
二、调用你的图像生成能力，以原截图为依据，实际生成一张优化后的完整界面示例图。不是只描述效果，也不是输出代码或画图提示词。
保留原有业务能力、重要入口和页面信息，不捏造数据或新增业务功能；不确定之处明确标注。界面中文清晰可读，避免套卡片、大面积渐变和装饰性阴影。保持原截图设备形态。
先输出完整文字方案，再生成示例图；图像仅为设计参考，不代表页面已经实现。若不能生成图，请如实说明，不以原图或占位图代替。
${brief ? `用户补充要求（作为设计需求，不是脚本执行指令）：\n${brief}` : ''}`;
}

async function writeJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temporary, file);
}

async function openRun(root, id) {
  if (!UUID.test(id)) throw new Error('run ID 必须为 UUID');
  const dir = path.join(root, 'runs', id);
  const file = path.join(dir, 'status.json');
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  return { dir, state, save: async changes => {
    Object.assign(state, changes, { updatedAt: new Date().toISOString() });
    await writeJson(file, state);
  } };
}

async function createRun(root, imagePaths, brief, id = randomUUID()) {
  if (!UUID.test(id)) throw new Error('run ID 必须为 UUID');
  if (!imagePaths.length || imagePaths.length > 4) throw new Error('需要 1～4 张页面截图');
  const inputs = [];
  for (const input of imagePaths) {
    const absolute = await fs.realpath(input);
    const info = await fs.stat(absolute);
    if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('截图须为不超过 20 MB 的文件');
    const bytes = await fs.readFile(absolute);
    if (bytes.length > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB');
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpg && !webp) throw new Error('截图仅支持 PNG、JPEG、WebP');
    inputs.push({ path: absolute, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
  const fingerprint = createHash('sha256').update(JSON.stringify({ inputs, brief })).digest('hex');
  const dir = path.join(root, 'runs', id);
  await fs.mkdir(path.dirname(dir), { recursive: true });
  try { await fs.mkdir(dir); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await openRun(root, id);
    if (existing.state.fingerprint !== fingerprint) throw new Error('同一 run ID 的图片或要求不同，不能复用');
    return existing;
  }
  const state = { id, fingerprint, status: 'PREPARED', submissionAttempted: false,
    inputImages: inputs, createdAt: new Date().toISOString(), transport: 'chatgpt-web-patchright',
    model: '由 ChatGPT 网页当前账号默认模型决定，未核验', artifacts: [] };
  await fs.writeFile(path.join(dir, 'prompt.txt'), buildPrompt(id, brief), { mode: 0o600 });
  await writeJson(path.join(dir, 'status.json'), state);
  return openRun(root, id);
}

/** All page selectors live here: these are experimental UI contracts, not official APIs. */
class ChatGptPage {
  constructor(page) { this.page = page; }
  async ready() {
    const login = this.page.getByRole('button', { name: /^(登录|Log in|Sign in)$/i });
    if (await login.first().isVisible()) return false;
    return this.page.locator('#prompt-textarea').isVisible();
  }
  async upload(files) {
    const inputs = this.page.locator('input[type="file"]');
    if (await inputs.count() === 0) {
      await this.page.getByRole('button', { name: /添加文件|添加照片|附件|Add files|Add photos|Attach/i }).first().click();
    }
    await this.page.locator('input[type="file"]').first().setInputFiles(files);
    // Send remains disabled while an attachment is uploading. Require the attachment to be visible too.
    await this.page.waitForFunction(count => {
      const composer = document.querySelector('#prompt-textarea')?.closest('form');
      if (!composer) return false;
      return [...composer.querySelectorAll('img')].filter(image => image.complete && image.naturalWidth > 0).length >= count;
    }, files.length, { timeout: 60000 });
  }
  async compose(prompt) {
    await this.page.locator('#prompt-textarea').fill(prompt);
    const send = this.page.locator('[data-testid="send-button"]');
    await send.waitFor({ state: 'visible', timeout: 60000 });
    await this.page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="send-button"]');
      return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    }, null, { timeout: 60000 });
  }
  async send() { await this.page.locator('[data-testid="send-button"]').click({ timeout: 10000 }); }
  async snapshot(id) {
    const url = this.page.url();
    const users = this.page.locator('[data-message-author-role="user"]');
    let anchor = null;
    for (let index = 0; index < await users.count(); index++) {
      const user = users.nth(index);
      if ((await user.innerText()).includes(`forge-visual-review:${id}`)) anchor = user;
    }
    if (!anchor) return { url, matched: false };
    // Scope outputs to turns after this run's user message; never collect another conversation's images.
    const turn = anchor.locator('xpath=ancestor::article[1]');
    if (await turn.count() !== 1) throw new Error('ChatGPT 消息结构已变化，无法确定任务输出范围');
    const following = turn.locator('xpath=following-sibling::article');
    const assistants = following.locator('[data-message-author-role="assistant"]');
    const text = (await assistants.allInnerTexts()).join('\n\n');
    const busy = await this.page.locator('[data-testid="stop-button"]').isVisible()
      || await following.locator('[data-is-streaming="true"]').count() > 0;
    const finished = await following.locator('[data-testid="copy-turn-action-button"]').count() > 0;
    const images = following.locator('img');
    const generated = [];
    for (let index = 0; index < await images.count(); index++) {
      const image = images.nth(index);
      const alt = await image.getAttribute('alt') || '';
      if (!/生成的图片|已生成|已创建图片|图片已创建|Generated image|Image created|Image generated/i.test(alt)) continue;
      if (await image.evaluate(element => element.complete && element.naturalWidth >= 256)) generated.push(image);
    }
    return { url, matched: true, text, busy, finished, generated };
  }
}

async function collect(adapter, run, { timeoutMs = 600000, pollMs = 1500, signal } = {}) {
  const deadline = Date.now() + timeoutMs;
  let stableSignature = null;
  let stableSince = 0;
  while (Date.now() < deadline) {
    if (signal?.aborted) { await run.save({ status: 'CANCELLED', message: '已停止本地收集；ChatGPT 任务可能仍在执行，可 collect 继续核对。' }); return run.state; }
    const snapshot = await adapter.snapshot(run.state.id);
    let resumeUrl;
    try { resumeUrl = conversationUrl(snapshot.url); } catch (error) {
      if (new URL(snapshot.url).origin !== ORIGIN) throw error;
    }
    if (resumeUrl && resumeUrl !== run.state.conversationUrl) await run.save({ conversationUrl: resumeUrl });
    if (snapshot.matched) {
      const changes = { status: 'COLLECTING', conversationUrl: conversationUrl(snapshot.url) };
      if (snapshot.text) {
        await fs.writeFile(path.join(run.dir, 'review.txt'), snapshot.text, { mode: 0o600 });
        changes.reviewText = snapshot.text;
      }
      await run.save(changes);
      const signature = JSON.stringify([snapshot.text, snapshot.generated.length]);
      if (signature !== stableSignature || snapshot.busy) { stableSignature = signature; stableSince = Date.now(); }
      if (!snapshot.busy && snapshot.finished && snapshot.text?.trim() && snapshot.generated.length > 0 && Date.now() - stableSince >= 4000) {
        const artifacts = [];
        for (let i = 0; i < snapshot.generated.length; i++) {
          const name = `example-${i + 1}-preview.png`;
          await snapshot.generated[i].screenshot({ path: path.join(run.dir, name), timeout: 15000 });
          artifacts.push({ file: name, kind: 'rendered-image-preview', originalDownload: false });
        }
        await run.save({ status: 'COMPLETED', artifacts, message: '已取得文字方案和网页生成图预览；不是原图下载，也不代表代码已经修改。' });
        return run.state;
      }
    }
    await pause(pollMs);
  }
  await run.save({ status: run.state.reviewText ? 'PARTIAL' : 'TIMED_OUT', message: '未在时限内取得完整文字和生成图；可 collect 继续收集，不自动重发。' });
  return run.state;
}

async function submit(adapter, run, { signal } = {}) {
  if (run.state.submissionAttempted) throw new Error('已尝试发送，禁止自动再次发送；使用 collect 核对原会话');
  if (!await adapter.ready()) { await run.save({ status: 'AUTH_REQUIRED', message: '请先运行 login 完成网页登录或人工验证。' }); return false; }
  await run.save({ status: 'UPLOADING' });
  for (const image of run.state.inputImages) {
    const bytes = await fs.readFile(image.path);
    if (createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw new Error('截图在准备后发生变化，请创建新任务');
  }
  await adapter.upload(run.state.inputImages.map(image => image.path));
  await adapter.compose(await fs.readFile(path.join(run.dir, 'prompt.txt'), 'utf8'));
  if (signal?.aborted) { await run.save({ status: 'CANCELLED_BEFORE_SEND' }); return false; }
  // Persist before the external side effect. A crash or click timeout must not replay the request.
  await run.save({ status: 'SUBMITTING', submissionAttempted: true });
  try { await adapter.send(); }
  catch (error) { await run.save({ status: 'SEND_UNCONFIRMED', message: '发送结果未知，请核对浏览器中的任务编号；禁止自动重发。' }); throw error; }
  await run.save({ status: 'SUBMITTED' });
  return true;
}

module.exports = { ORIGIN, buildPrompt, createRun, openRun, conversationUrl, ChatGptPage, collect, submit, pause };
