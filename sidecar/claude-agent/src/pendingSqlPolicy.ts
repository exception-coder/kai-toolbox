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
  PENDING_SQL_MANUAL_SCOPE,
  PENDING_SQL_DOCUMENTATION_RULE,
  '符合上述人工执行范围时，必须在最终回复前调用 forge.register_pending_sql 登记完整 SQL；只登记，不执行数据库。',
  'SQL 中禁止包含密码、Token 或连接凭据；分批产生 SQL 使用 append，重写整份脚本使用 replace。没有人工待执行 SQL 时不要调用。',
].join('\n')

export const FORGE_PENDING_SQL_TOOL_DESCRIPTION = [
  '把需要脱离应用正常运行、由开发、运维或 DBA 人工审核执行的数据库变更脚本登记到 Forge“待执行 SQL”台账。',
  '迁移、建表改表、初始化、回填、一次性数据修复和运维 DDL/DML 必须登记；工具只登记、绝不执行数据库。',
  '标题必须关联具体业务功能；每个 SQL 逻辑块前必须用“-- 功能：...；变更：...；目的：...”写明业务说明。',
  '不要登记 Repository/JDBC/MyBatis/ORM 运行时 SQL、测试夹具、SELECT/WITH 诊断查询或任何凭据。',
].join(' ')
