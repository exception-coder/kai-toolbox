import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, region, verifyPage } from './procurement-discover.mjs';

const row = { url: 'https://www.ggzy.gov.cn/information/deal/html/a/test.html', date: '2026-09-06', region: '河北省' };
test('province matching does not infer geography from titles or source names', () => {
  assert.equal(classify(row, row.date, '河北').regionStatus, 'MATCHED');
  assert.equal(region('内蒙古自治区'), '内蒙古');
  assert.equal(classify({ ...row, region: '央企招投标', title: '北京项目' }, row.date, '').regionStatus, 'REGION_UNKNOWN');
  assert.equal(classify({ ...row, region: '江苏省' }, row.date, '').regionStatus, 'EXCLUDED');
});
test('stale dates, wrong selected province and unsafe detail links are rejected', () => {
  assert.throws(() => classify(row, '2026-09-07', '河北'), /日期/);
  assert.throws(() => classify(row, row.date, '北京'), /省份/);
  assert.throws(() => classify({ ...row, url: 'http://127.0.0.1/admin' }, row.date, '河北'), /链接/);
});
test('pagination rejects repeated pages and unconfirmed empty results', () => {
  const fingerprints = new Set();
  const snapshot = { page: 1, validPaging: true, rows: [row], empty: false };
  verifyPage(snapshot, 1, fingerprints);
  assert.throws(() => verifyPage({ ...snapshot, page: 2 }, 2, fingerprints), /重复/);
  assert.throws(() => verifyPage(snapshot, 2, new Set()), /页码/);
  assert.throws(() => verifyPage({ ...snapshot, rows: [] }, 1, new Set()), /空态/);
  verifyPage({ ...snapshot, rows: [], empty: true }, 1, new Set());
});
