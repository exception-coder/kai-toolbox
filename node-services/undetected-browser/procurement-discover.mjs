import { chromium } from 'patchright';
import { pathToFileURL } from 'node:url';
import { allowedUrl } from './procurement-capture.mjs';

export const SOURCES = ['省平台', '央企招投标', '商务部', '财政部', '自然资源部', '国资委'];
export const PROVINCES = ['河北', '北京', '山西', '内蒙古', '天津'];
const ENTRY = 'https://www.ggzy.gov.cn/deal/dealList.html';
const MAX_PAGES = 500;
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function region(raw) {
  return PROVINCES.find(name => raw === name || raw === `${name}省` || raw === `${name}市` || raw === `${name}自治区`) || '';
}
export function classify(row, date, selectedProvince) {
  if (row.date !== date) throw new Error(`列表日期不符：${row.date || '缺失'}，预期 ${date}`);
  if (!allowedUrl(row.url, ['www.ggzy.gov.cn']) || !new URL(row.url).pathname.startsWith('/information/deal/')) {
    throw new Error('列表包含无法安全登记的详情链接');
  }
  const province = region(row.region);
  if (selectedProvince && province !== selectedProvince) throw new Error('列表省份与查询条件不符，拒绝保存旧页面');
  const excluded = /省$|市$|自治区$|特别行政区$/.test(row.region);
  return { ...row, province: province || (excluded ? row.region : ''), regionStatus: province ? 'MATCHED' : excluded ? 'EXCLUDED' : 'REGION_UNKNOWN' };
}

export function verifyPage(snapshot, number, fingerprints) {
  if (snapshot.page !== number || !snapshot.validPaging) throw new Error('无法确认页码或下一页状态');
  if (!snapshot.rows.length && !snapshot.empty) throw new Error('查询未返回可确认的结果或空态');
  if (snapshot.empty && snapshot.rows.length) throw new Error('列表与空态冲突');
  if (number > 1 && !snapshot.rows.length) throw new Error('翻页后结果意外为空，可能存在列表变动');
  const fingerprint = snapshot.rows.map(row => row.url).join('|');
  if (fingerprints.has(fingerprint)) throw new Error('翻页返回重复页面，采集不完整');
  fingerprints.add(fingerprint);
}

async function query(page, action) {
  const response = page.waitForResponse(r => ['xhr', 'fetch'].includes(r.request().resourceType())
    && r.request().method() === 'POST' && new URL(r.url()).hostname.endsWith('ggzy.gov.cn'), { timeout: 30000 });
  const [result] = await Promise.all([response, action()]);
  if (!result.ok()) throw new Error(`查询 HTTP ${result.status()}`);
  await result.finished();
  // 响应到达后等待框架完成 DOM 更新，避免读取上一组筛选的结果。
  await page.waitForTimeout(900);
}

async function readPage(page) {
  return page.evaluate(() => {
    const container = document.querySelector('#toview');
    const paging = document.querySelector('#paging');
    const next = [...(paging?.querySelectorAll('a') || [])].find(a => a.textContent.trim() === '下一页');
    return {
      rows: [...(container?.querySelectorAll('.publicont') || [])].map(node => ({
        title: node.querySelector('h4 a')?.textContent.trim() || '',
        url: node.querySelector('h4 a')?.href || '',
        date: node.querySelector('h4 .span_o')?.textContent.trim() || '',
        region: node.querySelector('p .span_on')?.textContent.trim() || '',
        metadata: node.querySelector('p')?.textContent.trim() || '',
      })),
      empty: document.querySelector('#publicl')?.innerText.includes('所选条件下暂无信息发布') || false,
      page: Number(paging?.querySelector('.a_hover')?.textContent),
      next: !!next && next.style.cursor === 'pointer',
      validPaging: !!next && ['pointer', 'default'].includes(next.style.cursor),
    };
  });
}

export async function discover(emit, input = {}) {
  const date = today();
  if (input.date && input.date !== date) throw new Error('仅支持北京时间当天采集');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let failed = 0;
  let completed = 0;
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => allowedUrl(route.request().url(), ['www.ggzy.gov.cn']) ? route.continue() : route.abort());
    for (const source of SOURCES) {
      const page = await context.newPage();
      try {
        const response = await page.goto(ENTRY, { waitUntil: 'networkidle', timeout: 45000 });
        if (!response?.ok()) throw new Error(`列表入口 HTTP ${response?.status()}`);
        await page.getByRole('link', { name: '当天', exact: true }).click();
        await page.getByRole('link', { name: source, exact: true }).click();
        const provinces = await page.locator('#provinceId').isVisible() ? PROVINCES : [''];
        for (const province of provinces) {
          let pages = 0;
          let seen = 0;
          try {
            if (today() !== date) throw new Error('采集跨过北京时间零点，请新建当日任务');
            if (province) {
              await page.locator('#provinceId').selectOption({ label: province });
              await page.locator('#cityId').selectOption({ label: '不限' });
              await page.locator('#platformId').selectOption({ label: '不限' });
            }
            if (await page.locator('#bidPlatformId').isVisible()) await page.locator('#bidPlatformId').selectOption({ label: '不限' });
            await page.getByRole('textbox', { name: '请输入关键字' }).fill('');
            const unlimited = page.locator('#choose_classify_00');
            if (await unlimited.isVisible()) await unlimited.click();
            // 来源切换会重置业务和信息类型；仅点击当前显示的不限控件。
            for (const control of await page.locator('[id^="choose_stage_"]:visible').all()) {
              if ((await control.innerText()).trim() === '不限') { await control.click(); break; }
            }
            emit({ type: 'scope', source, province, status: 'RUNNING', pages, seen, error: '' });
            await query(page, () => page.getByRole('button', { name: '搜索', exact: true }).click());
            const fingerprints = new Set();
            for (let number = 1; ; number++) {
              if (today() !== date) throw new Error('跨日查询已停止，请重新采集当天链接');
              const snapshot = await readPage(page);
              verifyPage(snapshot, number, fingerprints);
              const links = snapshot.rows.map(row => classify(row, date, province));
              pages++;
              seen += links.length;
              emit({ type: 'page', source, province, page: number, date, links });
              if (!snapshot.next) break;
              if (number >= MAX_PAGES) throw new Error(`达到 ${MAX_PAGES} 页安全上限，采集不完整`);
              await page.waitForTimeout(500);
              await query(page, () => page.locator('#paging').getByRole('link', { name: '下一页', exact: true }).click());
            }
            completed++;
            emit({ type: 'scope', source, province, status: 'COMPLETED', pages, seen, error: '' });
          } catch (error) {
            failed++;
            emit({ type: 'scope', source, province, status: 'FAILED', pages, seen, error: error.message });
          }
        }
      } catch (error) {
        failed++;
        emit({ type: 'scope', source, province: '', status: 'FAILED', pages: 0, seen: 0, error: error.message });
      } finally { await page.close(); }
    }
    emit({ type: 'done', date, status: failed ? completed ? 'PARTIAL' : 'FAILED' : 'COMPLETED', completed, failed });
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 1000) throw new Error('输入超限'); }
  const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
  try { await discover(emit, JSON.parse(input || '{}')); }
  catch (error) { emit({ type: 'fatal', error: error.message }); process.exitCode = 1; }
}
