/** 平台文档例外：只接收结构化内容，磁盘路径和会话身份始终由服务端决定。 */
const text = (maxLength: number) => ({ type: 'string', maxLength })
const array = (items: object, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems })
const object = (properties: object, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false })

export const consultDocumentTool = {
  name: 'generate_consult_document',
  description: '快速导出基础版式Word(docx)、Excel(xlsx)、PPT(pptx)。正式文档、汇报PPT或需要图表排版时优先design_consult_document。仅在平台受控目录保存，不能指定路径、执行代码、写源码或业务数据。format 对应只提供 sections/sheets/slides 其中一项。Excel每表最多5000数据行、40列，总计10万单元格含表头、100万字符；字符串按原文保存，不执行公式，超过15位有效精度的数字、长单号请用字符串。超限明确拆分导出，不遗漏未匹配行或并列记录。PPT 每页最多6条、每条65字符，标题和要点不可包含换行，长内容请拆页。成功后把返回的 downloadUrl 以 Markdown 下载链接交给用户；失败不得声称已生成。相同内容重试复用已有文件。',
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
      rows: array(array({ type: ['string', 'number', 'boolean', 'null'], maxLength: 8000 }, 1, 40), 0, 5000),
    }, ['name', 'columns', 'rows']), 1, 10),
    slides: array(object({ title: text(36), bullets: array(text(65), 1, 6) }, ['title', 'bullets']), 1, 30),
  }, ['format', 'title']),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

export const designConsultDocumentTool = {
  name: 'design_consult_document',
  description: `模型主导Office文档创作：script是纯JavaScript函数体，读取data，return文档对象。支持循环、计算和自行编排版式；无process/require/fetch/文件/网络/系统命令，不能import模块，限时限内存。
先组织结论、证据和行动，再设计页面。PPT单页一个重点，图表标明含义和单位，保证文字对比与留白；Word明确标题层级；Excel保留数据口径和精度，不编造缺失数据。日期从data传入，不使用Date或随机数；视觉检查最多修订3轮，仍有问题应如实说明。
返回格式：{format:'pptx'|'docx'|'xlsx',title,...正文,layout?}。主题layout.theme={accent,background,foreground,font}；颜色为六位RGB不含#，font仅Microsoft YaHei/Arial/Calibri。
PPT创作不传slides，传layout.pages=[{background,elements:[{kind:'text'|'rect'|'ellipse'|'line',x,y,w,h,text?,fontSize?,color?,fill?,bold?,align?:'left'|'center'|'right'}]}]。画布960×540，最多30页、每页60元素，全部边界须在画布内。可用代码循环生成图表、流程图与指标布局，全部为可编辑对象；文字字号9–64。自行保证正文可读、对比和留白，不要把长段文字塞入小文本框。
Word正文sections=[{heading?,paragraphs?,table?}]；layout.word={titleSize:16–40,headingSize:12–28,bodySize:9–18,landscape?:boolean}。
Excel正文sheets=[{name,columns:string[],rows:(string|number|boolean|null)[][]}]；layout.sheets=[{sheet:0起始索引,widths?:每列6–80,formats?:每列text/number/money/percent,formulas?:[{row:1起始数据行,column:0起始列,expression:'SUM(B2:B8)'}],chart?:{type:'bar'|'line'|'pie',title,categoryColumn:0,valueColumns:[1]}}]。公式只允许当前表内引用及SUM/AVERAGE/COUNT/MIN/MAX/ROUND/IF/ABS，拒绝外链、跨表和动态取数。长单号必须用字符串；字符串不执行公式。
成功后自动附带首批预览及说明。必须查看预览、检查排版和诊断，修正代码后重生成，再提供返回的downloadUrl；修订为新文件，旧文件保留。PPT超过4页请用preview_consult_document指定page继续检查。Word/Excel预览为结构预览，不能宣称最终分页已验证。不要编造下载链接或声称未检查的页面已检查。`,
  inputSchema: object({ script: { type: 'string', minLength: 1, maxLength: 50_000 },
    data: { type: 'object', description: '本次已选择的数据，不含凭据或路径；仅供纯JavaScript处理。' } }, ['script']),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

export const previewConsultDocumentTool = {
  name: 'preview_consult_document',
  description: '检查当前咨询已生成文件的预览和诊断，documentId来自生成结果。PPT为实际渲染，每次最多4页，page指定起始页；Word/Excel为首屏结构预览，不代表最终分页。不能读取其他会话或任意路径。',
  inputSchema: object({ documentId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    page: { type: 'integer', minimum: 1, maximum: 30 } }, ['documentId']),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}
