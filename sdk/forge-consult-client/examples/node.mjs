import { ForgeConsultClient } from '@kai/forge-consult-client';

// Run on a trusted server. Supply the actual authorized user's token via your secret store/environment.
const baseUrl = process.env.FORGE_BASE_URL;
const token = process.env.FORGE_ACCESS_TOKEN;
if (!baseUrl || !token) throw new Error('请配置 FORGE_BASE_URL 和 FORGE_ACCESS_TOKEN');
const requestId = process.env.FORGE_REQUEST_ID ?? crypto.randomUUID();
const client = new ForgeConsultClient({ baseUrl, getAccessToken: () => token,
  onCheckpoint: checkpoint => console.error('checkpoint:', JSON.stringify(checkpoint)),
});
const timer = setTimeout(() => { console.error('等待超时；关闭不代表取消，请用原检查点恢复'); client.close(); }, 600_000);
client.on(event => {
  if (event.type === 'answer.delta') process.stdout.write(event.text ?? '');
  if (event.type === 'answer.snapshot') console.log('\n当前回答：\n', event.text);
  if (event.type === 'completed' && event.requestId === requestId) { console.log('\n终态：', event.stopReason); clearTimeout(timer); client.close(); }
  if (event.type === 'error') { console.error(event.code, event.message); clearTimeout(timer); client.close(); }
});
try {
  // Persist requestId + the exact input before sending in your own application store.
  const receipt = await client.ask({ requestId, consultationId: process.env.FORGE_CONSULTATION_ID,
    question: process.argv[2] ?? '如何查看采购订单的审核状态？' });
  console.error('请求已登记（尚不代表回答完成）：', receipt);
} catch (error) { clearTimeout(timer); client.close(); throw error; }
