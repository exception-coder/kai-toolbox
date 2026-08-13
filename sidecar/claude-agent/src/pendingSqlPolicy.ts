export const PENDING_SQL_MANUAL_SCOPE = [
  '仅当当前任务产出需要在应用正常运行之外，由开发、运维或 DBA 人工审核并执行的数据库变更脚本时，才登记待执行 SQL。',
  '应登记迁移、建表改表、初始化、回填、一次性数据修复和运维 DDL/DML。',
  '不要登记 Repository/JDBC/MyBatis/ORM 中随应用正常运行自动执行的 SQL、测试夹具或 SELECT/WITH 纯诊断查询。',
].join('\n')

export const PENDING_SQL_DOCUMENTATION_RULE = [
  '登记标题必须写明关联的系统或模块、业务功能和变更目的，禁止使用“数据库修改”等泛化标题。',
  'SQL 正文的每个独立逻辑变更块前必须使用单行注释“-- 功能：...；变更：...；目的：...”，确保脚本脱离会话后仍可独立审阅和交接。',
  '使用 append 时，新追加的每个逻辑块也必须自带完整业务注释；不得根据表名猜测业务含义。',
].join('\n')

export const FORGE_PENDING_SQL_STEER = [
  '【Forge 待执行 SQL 登记规则】',
  '生成可执行 DDL/DML 前，先识别目标表并调用 forge.prepare_sql_context。只可依据返回的 DDL 片段使用字段；状态不是 VERIFIED 时，必须把缺失/歧义/过期警告明确告知用户，禁止猜测字段。',
  PENDING_SQL_MANUAL_SCOPE,
  PENDING_SQL_DOCUMENTATION_RULE,
  '符合上述人工执行范围时，必须在最终回复前调用 forge.register_pending_sql 登记完整 SQL；只登记，不执行数据库。',
  'SQL 中禁止包含密码、Token 或连接凭据；分批产生 SQL 使用 append，重写整份脚本使用 replace。没有人工待执行 SQL 时不要调用。',
].join('\n')

export const FORGE_SQL_CONTEXT_TOOL_DESCRIPTION = [
  '生成或实质修改可执行 SQL 前，根据当前会话工作目录定位对应项目知识库，只返回目标表的 DDL 片段和证据状态。',
  '先传入明确的目标表；聚合工作区返回 PROJECT_AMBIGUOUS 时，从 candidateProjects 选择 project 后重试。',
  'VERIFIED 才表示目标表均已核验；PARTIAL、DDL_MISSING、PROJECT_AMBIGUOUS、STALE、NOT_CHECKED 均不得猜测字段，必须提示用户复核。',
  '本工具只读本地知识库，不连接或执行数据库。',
].join(' ')

/** 无 Forge MCP 的引擎仅在识别到 SQL 意图时追加，不污染普通会话。 */
export const SQL_DDL_FALLBACK_RULE = [
  'SQL 可靠性要求：生成可执行 DDL/DML 前，必须先读取当前项目知识库中的 ddl-baseline.md，并只依据目标表真实字段生成。',
  '找不到项目、DDL 缺失/过期或目标表未命中时，必须把结果标记为“DDL 未核验草稿”并明确警告，禁止猜测字段。',
].join('\n')

const SQL_INTENT = /(?:\b(?:sql|ddl|dml|alter\s+table|create\s+table|insert\s+into|update\s+\w+|delete\s+from)\b|数据库脚本|建表|改表|加字段|回填数据|数据修复)/i

export function appendSqlDdlFallbackRule(text: string): string {
  return SQL_INTENT.test(text) ? `${text}\n\n${SQL_DDL_FALLBACK_RULE}` : text
}

export const FORGE_PENDING_SQL_TOOL_DESCRIPTION = [
  '把需要脱离应用正常运行、由开发、运维或 DBA 人工审核执行的数据库变更脚本登记到 Forge“待执行 SQL”台账。',
  '迁移、建表改表、初始化、回填、一次性数据修复和运维 DDL/DML 必须登记；工具只登记、绝不执行数据库。',
  '标题必须关联具体业务功能；每个 SQL 逻辑块前必须用“-- 功能：...；变更：...；目的：...”写明业务说明。',
  '不要登记 Repository/JDBC/MyBatis/ORM 运行时 SQL、测试夹具、SELECT/WITH 诊断查询或任何凭据。',
  '传入 prepare_sql_context 返回的 evidenceId；登记端仍会重新解析 SQL 表名并独立核验，不信任模型自行声明。',
].join(' ')
