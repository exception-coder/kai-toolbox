// Node.js 22+. A server example: persist the complete input and requestId in your application first.
import { ForgeConsultBackendClient } from '@kai/forge-consult-client/backend';
import { readFile } from 'node:fs/promises';

for (const key of ['FORGE_BASE_URL', 'FORGE_CLIENT_ID', 'FORGE_CLIENT_SECRET', 'FORGE_TENANT_ID', 'IT_PROBLEM_ID', 'IT_REQUEST_ID']) {
  if (!process.env[key]) throw new Error(`缺少服务端环境变量 ${key}`);
}
const client = new ForgeConsultBackendClient({
  baseUrl: process.env.FORGE_BASE_URL,
  clientId: process.env.FORGE_CLIENT_ID,
  getClientSecret: () => process.env.FORGE_CLIENT_SECRET,
});
// Optional original image. IT_IMAGE_PATH is read by THIS application, never sent as a path to Forge.
// Persist IT_UPLOAD_ID, original bytes and resulting attachment ID before constructing/persisting input.
const attachmentIds = [];
if (process.env.IT_IMAGE_PATH) {
  if (!process.env.IT_UPLOAD_ID || !['image/png', 'image/jpeg'].includes(process.env.IT_IMAGE_TYPE))
    throw new Error('原图需要已持久化 IT_UPLOAD_ID 及 IT_IMAGE_TYPE=image/png 或 image/jpeg');
  const image = await client.uploadImage(process.env.IT_UPLOAD_ID, await readFile(process.env.IT_IMAGE_PATH), process.env.IT_IMAGE_TYPE);
  attachmentIds.push(image.attachmentId);
  console.log(JSON.stringify({ uploadId: image.uploadId, attachmentId: image.attachmentId, expiresAt: image.expiresAt }));
}
const input = {
  agentId: 'it-support-partner', tenantId: process.env.FORGE_TENANT_ID,
  problemId: process.env.IT_PROBLEM_ID, conversationId: process.env.IT_PROBLEM_ID,
  requestId: process.env.IT_REQUEST_ID, title: '标签打印无反应',
  description: '用户报告点击标签打印后没有反应，尚未确认影响范围。',
  classification: { decision: 'IT', reason: '涉及业务系统打印功能异常' },
  recentContext: [], systemIds: [], attachmentTexts: [], evidenceRefs: [],
  attachmentIds, replyMode: 'FORGE',
};
// A submit timeout is unknown, not a failed analysis: find(input.requestId) or explicitly resubmit the EXACT same input/key.
let task = await client.submit(input);
console.log(JSON.stringify({ taskId: task.taskId, requestId: task.requestId, status: task.status }));
const until = Date.now() + 240000;
while (['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(task.status) && Date.now() < until) {
  await new Promise(resolve => setTimeout(resolve, 2500));
  task = await client.get(task.taskId);
}
console.log(JSON.stringify(task, null, 2));
// Keep the persisted task ID if still running. Disconnect does not cancel it.
// Only SUCCEEDED/NEEDS_INFORMATION have validated results. replyMode FORGE returns three saved candidates.
// Save candidate ID/text/evidence and human edits; Feishu sending still requires explicit human confirmation.
