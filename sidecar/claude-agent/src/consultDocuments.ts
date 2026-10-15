/** 平台文档例外：只接收结构化内容，磁盘路径和会话身份始终由服务端决定。 */
const text = (maxLength: number) => ({ type: 'string', maxLength })
const array = (items: object, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems })
const object = (properties: object, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false })

export const consultDocumentTool = {
  name: 'generate_consult_document',
  description: '按用户要求生成可下载的 Word(docx)、Excel(xlsx)、PPT(pptx)。仅在平台受控目录保存，不能指定路径、执行代码、写源码或业务数据。format 对应只提供 sections/sheets/slides 其中一项。Excel 字符串按原文保存，不执行公式；超过15位有效精度的数字、长单号请用字符串。PPT 每页最多6条、每条65字符，标题和要点不可包含换行，长内容请拆页。成功后把返回的 downloadUrl 以 Markdown 下载链接交给用户；失败不得声称已生成。相同内容重试复用已有文件。',
  inputSchema: object({
    format: { type: 'string', enum: ['docx', 'xlsx', 'pptx'] },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    sections: array(object({
      heading: text(160), paragraphs: array(text(8000), 0, 200),
      table: array(array(text(2000), 1, 12), 1, 200),
    }, []), 1, 80),
    sheets: array(object({
      name: { type: 'string', minLength: 1, maxLength: 31 },
      columns: array(text(120), 1, 40),
      rows: array(array({ type: ['string', 'number', 'boolean', 'null'], maxLength: 8000 }, 1, 40), 0, 2000),
    }, ['name', 'columns', 'rows']), 1, 10),
    slides: array(object({ title: text(36), bullets: array(text(65), 1, 6) }, ['title', 'bullets']), 1, 30),
  }, ['format', 'title']),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}
