// Explicit manual smoke test against a configured account. Not part of the offline suite.
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexTurn } from '../.external-consult-test-dist/codexEngine.js';
import { callAppServer, deleteCodexThread } from '../.external-consult-test-dist/codexAppServer.js';

const [codexHome, model] = process.argv.slice(2);
if (!codexHome || !model) throw new Error('Pass the configured Codex home and model; do not pass credentials.');
const source = readFileSync(new URL('../../../tools/tool-fore-consult/src/main/java/com/exceptioncoder/toolbox/foreconsult/backend/ExternalConsultInstructions.java', import.meta.url), 'utf8');
const rules = source.split('"""')[1];
const cwd = mkdtempSync(join(tmpdir(), 'forge-external-consult-smoke-'));
let threadId;
const results = [];
for (const [message, expected] of [
  ['已知样衣系统手机端底部有扫码入口，点直接扫码后扫描标签二维码。我的问题：手机怎么扫样衣？', 'REPLY'],
  ['吃饭了没有', 'IGNORE'],
  ['刚才那个手机入口叫什么？', 'REPLY'],
]) {
  let answer = '', terminal;
  const before = threadId;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    await runCodexTurn({ text: message, cwd, codexHome, model, reasoningEffort: 'low',
      permissionMode: 'default', toolPolicy: 'disabled', strictThreadContinuity: true,
      threadTitle: 'sdk-regression-实施答疑', sdkSessionId: threadId,
      developerInstructions: `${rules}\n本轮仅用于虚构资料回归。输出 JSON {"messageAction":"REPLY|UPDATE_ONLY|IGNORE","reply":"字符串"}；IGNORE 的 reply 为空。`,
      signal: controller.signal,
      setSdkSessionId: id => { threadId = id },
      emit: event => {
        if (event.type === 'assistantDelta') answer += event.text ?? '';
        if (event.type === 'assistantSnapshot') answer = event.text ?? '';
        if (event.type === 'result') terminal = event.stopReason;
      },
    });
  } finally { clearTimeout(timeout) }
  if (terminal !== 'end_turn' || !threadId || (before && before !== threadId)) throw new Error('Native turn did not preserve identity and complete.');
  const parsed = JSON.parse(answer);
  if (parsed.messageAction !== expected || (expected === 'IGNORE' && parsed.reply !== '')) throw new Error('Unexpected disposition: ' + answer);
  results.push(parsed);
}
if (!/扫码/.test(results[2].reply)) throw new Error('Follow-up did not retain the original business context.');
const metadata = await callAppServer('thread/read', { threadId }, codexHome);
if (metadata.thread?.name !== 'sdk-regression-实施答疑') throw new Error('Native title was not saved.');
await deleteCodexThread(threadId, codexHome);
console.log(JSON.stringify({ nativeSmokePassed: true, threadId, titleVerified: true, testThreadDeleted: true, turns: results }));
