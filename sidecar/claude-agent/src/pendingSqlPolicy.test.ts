import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendSqlDdlFallbackRule,
  FORGE_PENDING_SQL_STEER,
  FORGE_PENDING_SQL_TOOL_DESCRIPTION,
  FORGE_SQL_CONTEXT_TOOL_DESCRIPTION,
  SQL_DDL_FALLBACK_RULE,
} from './pendingSqlPolicy.js'

test('SQL intent gets DDL fallback guidance for engines without Forge MCP', () => {
  const result = appendSqlDdlFallbackRule('请为订单表补充一个状态字段并输出 SQL')
  assert.match(result, /ddl-baseline\.md/)
  assert.ok(result.endsWith(SQL_DDL_FALLBACK_RULE))
})

test('ordinary coding prompt stays unchanged', () => {
  const prompt = '优化一下移动端按钮间距'
  assert.equal(appendSqlDdlFallbackRule(prompt), prompt)
})

test('missing DDL is a visible warning instead of a delivery or registration gate', () => {
  assert.match(FORGE_PENDING_SQL_STEER, /只是风险警告，不是交付或登记门禁/)
  assert.match(FORGE_PENDING_SQL_STEER, /不得因此中断、拒绝或改为不产出 SQL/)
  assert.match(FORGE_SQL_CONTEXT_TOOL_DESCRIPTION, /不阻止继续生成、交付和登记/)
  assert.match(FORGE_PENDING_SQL_TOOL_DESCRIPTION, /未传入或证据非 VERIFIED 也允许登记/)
  assert.match(SQL_DDL_FALLBACK_RULE, /不得因此中断或拒绝产出 SQL/)
  assert.doesNotMatch(FORGE_PENDING_SQL_STEER, /禁止猜测字段/)
})
