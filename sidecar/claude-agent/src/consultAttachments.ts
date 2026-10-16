/** 附件内容通过宿主校验归属和动态限制，不能绕过源码目录保护。 */
export const consultAttachmentTool = {
  name: 'read_consult_attachment',
  description: '读取当前咨询已上传附件。文本/CSV/HTML用offset/maxChars字符分页，以nextOffset继续，超过2MB也可读。XLSX先只传path列出sheets，再传sheet原名、startRow(1起始)、maxRows，按nextRow继续直至complete；不要给XLSX传字符offset/maxChars。返回原始行号、稀疏坐标、raw/display与公式缓存，缺失坐标为空而不是0；totalRows是最大原始行号，不是有效数据条数。公式仅返回表达式及可能过期的缓存，不计算、不执行宏/外链。不执行HTML/JavaScript；图片使用图片输入，旧XLS/Word/PDF请转存XLSX或文本。失败按明确原因恢复，不能用终端绕过归属、路径、大小或权限限制。',
  inputSchema: { type: 'object', properties: {
    path: { type: 'string', description: '当前消息已上传附件的路径' },
    offset: { type: 'integer', minimum: 0, description: '字符偏移，默认0；继续读取用上次nextOffset' },
    maxChars: { type: 'integer', minimum: 1, maximum: 50000, description: '返回字符数，默认12000' },
    sheet: { type: 'string', minLength: 1, maxLength: 31, description: 'XLSX工作表原名，不传时只列出工作表' },
    startRow: { type: 'integer', minimum: 1, maximum: 50001, description: 'XLSX原始行号，默认1；继续读取用nextRow' },
    maxRows: { type: 'integer', minimum: 1, maximum: 500, description: 'XLSX单页最大行范围，默认100；返回量超限会提前分页' },
  }, required: ['path'], additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

export async function readConsultAttachment(args: Record<string, unknown>, context: { apiBase: string; session?: string; token?: string }) {
  if (!context.session || !context.token || typeof args.path !== 'string' || args.path.length > 4096) throw new Error('咨询附件上下文或路径无效')
  const response = await fetch(`${context.apiBase}/api/fore-consult/attachments/sessions/${encodeURIComponent(context.session)}/read`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Consult-Resource-Token': context.token },
    body: JSON.stringify({ path: args.path, offset: args.offset, maxChars: args.maxChars,
      sheet: args.sheet, startRow: args.startRow, maxRows: args.maxRows }), signal: AbortSignal.timeout(20000),
  })
  const result = await response.text()
  if (result.length > 350000) return { content: [{ type: 'text', text: '附件响应超限，不能把截断内容当成完整数据；请减小maxRows或maxChars重试。' }], isError: true }
  return { content: [{ type: 'text', text: result }], ...(!response.ok ? { isError: true } : {}) }
}
