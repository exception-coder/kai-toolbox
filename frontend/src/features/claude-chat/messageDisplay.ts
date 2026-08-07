const LEGACY_FORGE_PENDING_SQL_PREFIX = [
  '【Forge 待执行 SQL 登记规则】',
  '当你为当前开发任务新建或实质修改可执行的数据库 DDL/DML 时，必须在最终回复前调用 forge.register_pending_sql，登记完整 SQL。',
  '只登记，不执行数据库；SELECT/WITH 等纯诊断查询不要登记；SQL 中禁止包含密码、Token 或连接凭据。',
  '同一任务分批产生 SQL 时使用 append；重写整份脚本时使用 replace。没有数据库变更时不要调用。',
].join('\n')

const CURRENT_FORGE_PENDING_SQL_PREFIX = [
  '【Forge 待执行 SQL 登记规则】',
  '仅当当前任务产出需要在应用正常运行之外，由开发、运维或 DBA 人工审核并执行的数据库变更脚本时，才登记待执行 SQL。',
  '应登记迁移、建表改表、初始化、回填、一次性数据修复和运维 DDL/DML。',
  '不要登记 Repository/JDBC/MyBatis/ORM 中随应用正常运行自动执行的 SQL、测试夹具或 SELECT/WITH 纯诊断查询。',
  '登记标题必须写明关联的系统或模块、业务功能和变更目的，禁止使用“数据库修改”等泛化标题。',
  'SQL 正文的每个独立逻辑变更块前必须使用单行注释“-- 功能：...；变更：...；目的：...”，确保脚本脱离会话后仍可独立审阅和交接。',
  '使用 append 时，新追加的每个逻辑块也必须自带完整业务注释；不得根据表名猜测业务含义。',
  '符合上述人工执行范围时，必须在最终回复前调用 forge.register_pending_sql 登记完整 SQL；只登记，不执行数据库。',
  'SQL 中禁止包含密码、Token 或连接凭据；分批产生 SQL 使用 append，重写整份脚本使用 replace。没有人工待执行 SQL 时不要调用。',
].join('\n')

const CONSULT_PROTOCOL_MARKER = '【业务咨询调度协议】consult-orchestration-v1'
const CONSULT_QUESTION_MARKER = '用户原始问题：\n'
const CONSULT_STEP_MARKER = /\r?\n\r?\n【步骤\s+\d+：/
const LEGACY_CONSULT_READONLY_PREFIX = [
  '【系统只读安全边界】本会话只能读取、搜索和调用系统明确注入的只读 MCP 工具。',
  '严禁创建、修改、删除、移动或重命名任何文件；严禁执行会改变 Git、依赖、配置、数据库或业务数据的命令。',
  '允许在回答中生成完整的 UPDATE/INSERT/DELETE/MERGE 及 DDL SQL，供 IT 实施人员交给 DBA 人工审核执行；“输出 SQL 文本”不属于执行写操作。',
  '生成或实质修改可执行 DDL/DML 后，必须先调用 forge.register_pending_sql 登记完整 SQL；该工具只写 Forge 本地待执行台账，不连接或修改目标数据库。SELECT/WITH 诊断查询无需登记。',
  '若 Forge 登记工具不可用或调用失败，仍应向用户交付 SQL，同时明确说明登记失败，不能因此拒绝回答。',
  '不得亲自执行变更 SQL，不得尝试绕过沙箱、切换权限、调用未列入白名单的 MCP/插件/App；SQL 中不得包含密码、Token、连接串等凭据。',
].join('\n')

function removeKnownPrefix(raw: string, prefixes: string[]): string | undefined {
  const prefix = prefixes.find(candidate => raw.startsWith(candidate))
  if (!prefix) return undefined
  return raw.slice(prefix.length).replace(/^\r?\n\r?\n/, '')
}

/** 隐藏旧版 sidecar 曾误写进 user_message 的平台指令，不改动原始会话文件。 */
export function normalizeUserMessageForDisplay(raw: string): string {
  if (raw.includes(CONSULT_PROTOCOL_MARKER)) {
    const questionMarkerIndex = raw.indexOf(CONSULT_QUESTION_MARKER)
    if (questionMarkerIndex >= 0) {
      const questionWithSteps = raw.slice(questionMarkerIndex + CONSULT_QUESTION_MARKER.length)
      const stepMarkerIndex = questionWithSteps.search(CONSULT_STEP_MARKER)
      return (stepMarkerIndex >= 0 ? questionWithSteps.slice(0, stepMarkerIndex) : questionWithSteps).trim()
    }
  }
  const consultText = removeKnownPrefix(raw, [LEGACY_CONSULT_READONLY_PREFIX])
  if (consultText !== undefined) return consultText
  const forgeText = removeKnownPrefix(raw, [
    CURRENT_FORGE_PENDING_SQL_PREFIX,
    LEGACY_FORGE_PENDING_SQL_PREFIX,
  ])
  if (forgeText !== undefined) return forgeText
  return raw
}
