const LEGACY_FORGE_PENDING_SQL_PREFIX = [
  '【Forge 待执行 SQL 登记规则】',
  '当你为当前开发任务新建或实质修改可执行的数据库 DDL/DML 时，必须在最终回复前调用 forge.register_pending_sql，登记完整 SQL。',
  '只登记，不执行数据库；SELECT/WITH 等纯诊断查询不要登记；SQL 中禁止包含密码、Token 或连接凭据。',
  '同一任务分批产生 SQL 时使用 append；重写整份脚本时使用 replace。没有数据库变更时不要调用。',
].join('\n')

/** 隐藏旧版 sidecar 曾误写进 user_message 的平台指令，不改动原始会话文件。 */
export function normalizeUserMessageForDisplay(raw: string): string {
  if (!raw.startsWith(LEGACY_FORGE_PENDING_SQL_PREFIX)) return raw
  return raw.slice(LEGACY_FORGE_PENDING_SQL_PREFIX.length).replace(/^\r?\n\r?\n/, '')
}
