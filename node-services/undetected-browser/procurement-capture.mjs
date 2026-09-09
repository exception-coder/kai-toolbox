import { chromium } from 'patchright';
import { pathToFileURL } from 'node:url';

const MAX_TEXT = 80000;
const TIMEOUT = 25000;

export function allowedUrl(value, hosts) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && hosts.includes(url.hostname)
      && !url.username && !url.password && (!url.port || ['80', '443'].includes(url.port));
  } catch { return false; }
}

export async function readArticle(page, hosts) {
  const frames = [];
  for (const frame of page.frames()) {
    if (!allowedUrl(frame.url(), hosts)) continue;
    try {
      const text = await frame.locator('body').innerText({ timeout: 4000 });
      if (text.trim().length >= 100) frames.push({ text, url: frame.url() });
    } catch (error) {
      process.stderr.write(`frame read failed: ${error.message}\n`);
    }
  }
  frames.sort((a, b) => Number(b.url.includes('/html/b/')) - Number(a.url.includes('/html/b/'))
    || b.text.length - a.text.length);
  const article = frames[0];
  if (!article) throw new Error('未读取到有效正文（至少 100 字），请检查来源或重试');
  if (/^(502 Bad Gateway|Access Denied|403 Forbidden|验证码)/i.test(article.text.trim())) {
    throw new Error('站点返回拦截或错误页面，请打开来源核验');
  }
  if (article.text.length > MAX_TEXT) throw new Error('正文超过 80000 字符，请缩小采集范围');
  const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => ({
    title: node.textContent?.trim() ?? '', url: node.href,
  })));
  return { text: article.text, frameUrl: article.url, title: await page.title(), finalUrl: page.url(),
    links: links.filter(link => link.title.length >= 8 && allowedUrl(link.url, hosts)).slice(0, 100) };
}

export async function snapshotPage(page, hosts) {
  const frames = [];
  for (const frame of page.frames()) {
    if (!allowedUrl(frame.url(), hosts)) continue;
    frames.push({ url: frame.url(), html: await frame.content(),
      text: await frame.locator('body').innerText({ timeout: 4000 }) });
  }
  const html = await page.content();
  if (Buffer.byteLength(JSON.stringify({ html, frames }), 'utf8') > 12 * 1024 * 1024) {
    throw new Error('页面快照超过 12 MB，未保存不完整缓存');
  }
  return { html, frames };
}

async function collect(input) {
  if (!allowedUrl(input.url, input.hosts)) throw new Error('公告 URL 不属于允许的站点');
  const browser = await chromium.launch({ headless: true, channel: input.channel || 'chrome' });
  try {
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => allowedUrl(route.request().url(), input.hosts)
      ? route.continue() : route.abort());
    const { page, response } = await navigate(context, input.url);
    if (!response || response.status() >= 400) throw new Error(`来源返回 HTTP ${response?.status() ?? '未知'}`);
    // 动态 iframe 的正文可能晚于主文档加载；短轮询避免无限等待 networkidle。
    let article;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try { article = await readArticle(page, input.hosts); }
      catch (error) { if (attempt === 7) throw error; else continue; }
      if (!requiresArticleFrame(input.url) || article.frameUrl.includes('/html/b/')) break;
    }
    if (requiresArticleFrame(input.url) && !article?.frameUrl.includes('/html/b/')) {
      throw new Error('全国平台正文 iframe 未就绪，请重试');
    }
    return { ...article, ...await snapshotPage(page, input.hosts), httpStatus: response.status() };
  } finally { await browser.close(); }
}

function requiresArticleFrame(url) {
  const source = new URL(url);
  return source.hostname === 'www.ggzy.gov.cn' && source.pathname.includes('/html/a/');
}

async function navigate(context, url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const page = await context.newPage();
    const target = attempt === 1 && new URL(url).hostname === 'ggzy.yq.gov.cn'
      ? url.replace(/^https:/, 'http:') : url;
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      if (response?.status() >= 500) throw new Error(`来源返回 HTTP ${response.status()}`);
      return { page, response };
    } catch (error) {
      await page.close();
      if (attempt === 1) throw error;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16000) throw new Error('采集输入过大');
  }
  try { process.stdout.write(JSON.stringify(await collect(JSON.parse(input)))); }
  catch (error) {
    const message = error.message.replace(/\u001b\[[0-9;]*m/g, '').split('Call log:')[0].trim();
    process.stdout.write(JSON.stringify({ error: message })); process.exitCode = 1;
  }
}
