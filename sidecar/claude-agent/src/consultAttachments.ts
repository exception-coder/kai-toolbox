/** 附件内容通过宿主校验归属和动态限制，不能绕过源码目录保护。 */
export const consultAttachmentTool = {
  name: 'read_consult_attachment',
  description: '分段读取当前咨询已上传的文本/HTML附件，超过2MB也可读取；传入消息中的附件路径，以nextOffset继续。只返回有界文本，不执行HTML或脚本；嵌入图片/JavaScript数据不等于已解析的表格。Office/PDF使用对应解析能力，图片使用图片输入。',
  inputSchema: { type: 'object', properties: {
    path: { type: 'string', description: '当前消息已上传附件的路径' },
    offset: { type: 'integer', minimum: 0, description: '字符偏移，默认0；继续读取用上次nextOffset' },
    maxChars: { type: 'integer', minimum: 1, maximum: 50000, description: '返回字符数，默认12000' },
  }, required: ['path'], additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

export async function readConsultAttachment(args: Record<string, unknown>, context: { apiBase: string; session?: string; token?: string }) {
  if (!context.session || !context.token || typeof args.path !== 'string' || args.path.length > 4096) throw new Error('咨询附件上下文或路径无效')
  const response = await fetch(`${context.apiBase}/api/fore-consult/attachments/sessions/${encodeURIComponent(context.session)}/read`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Consult-Resource-Token': context.token },
    body: JSON.stringify({ path: args.path, offset: args.offset, maxChars: args.maxChars }), signal: AbortSignal.timeout(20000),
  })
  return { content: [{ type: 'text', text: (await response.text()).slice(0, 350000) }], ...(!response.ok ? { isError: true } : {}) }
}
