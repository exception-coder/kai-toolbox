import assert from 'node:assert/strict'
import test from 'node:test'
import { appendSqlDdlFallbackRule, SQL_DDL_FALLBACK_RULE } from './pendingSqlPolicy.js'

test('SQL intent gets DDL fallback guidance for engines without Forge MCP', () => {
  const result = appendSqlDdlFallbackRule('请为订单表补充一个状态字段并输出 SQL')
  assert.match(result, /ddl-baseline\.md/)
  assert.ok(result.endsWith(SQL_DDL_FALLBACK_RULE))
})

test('ordinary coding prompt stays unchanged', () => {
  const prompt = '优化一下移动端按钮间距'
  assert.equal(appendSqlDdlFallbackRule(prompt), prompt)
})
