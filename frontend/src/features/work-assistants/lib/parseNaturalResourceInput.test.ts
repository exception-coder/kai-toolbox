import { expect, it } from 'vitest'
import { parseNaturalResourceInput } from './parseNaturalResourceInput'

it('classifies a natural production MySQL paste and separates credentials from metadata', () => {
  const { value, missing } = parseNaturalResourceInput('登记生产环境 MySQL 10.0.0.8:3307\n数据库：erp\n账号：report\n密码："p:a=s sword"', 'erp', 'ERP')
  expect(missing).toEqual([])
  expect(value).toMatchObject({ kind: 'DATABASE', environment: 'PROD', type: 'MYSQL', host: '10.0.0.8', port: 3307, database: 'erp', username: 'report', password: 'p:a=s sword' })
})

it('supports inline fields without copying password text into visible database or host fields', () => {
  const { value } = parseNaturalResourceInput('生产 MySQL 地址:10.0.0.8:3307 database:erp user:report password:secret123', 'erp', 'ERP')
  expect(value).toMatchObject({ host: '10.0.0.8', port: 3307, database: 'erp', username: 'report', password: 'secret123' })
  expect([value.host, value.database, value.name].join(' ')).not.toContain('secret123')
  const compact = parseNaturalResourceInput('生产 MySQL 10.0.0.8\ndatabase=erp,user=report,password=secret123', 'erp', 'ERP')
  expect(compact.value.database).toBe('erp')
  expect([compact.value.host, compact.value.database, compact.value.name].join(' ')).not.toContain('secret123')
  expect(parseNaturalResourceInput('生产 MySQL 10.0.0.8 user:report password:p,a;s', 'erp', 'ERP').missing.join(' ')).toContain('避免截断')
})

it('classifies SSH and strips URL userinfo from public application addresses', () => {
  expect(parseNaturalResourceInput('测试环境 ssh://ops:p%40ss@10.0.0.2:2222', 'erp', 'ERP').value)
    .toMatchObject({ kind: 'HOST', environment: 'TEST', type: 'SSH', port: 2222, username: 'ops', password: 'p@ss' })
  const app = parseNaturalResourceInput('开发 https://admin:secret@example.com/login', 'erp', 'ERP')
  expect(app.value).toMatchObject({ kind: 'APPLICATION', baseUrl: 'https://example.com/login', username: 'admin', password: 'secret' })
})

it('does not infer an environment from a credential or invent one when missing or ambiguous', () => {
  expect(parseNaturalResourceInput('mysql://user:PROD@10.0.0.2/prod', 'erp', 'ERP').missing).toContain('环境（如生产、测试）')
  expect(parseNaturalResourceInput('测试和生产 MySQL 10.0.0.2', 'erp', 'ERP').value.environment).toBe('')
  expect(parseNaturalResourceInput('MySQL 10.0.0.2\npassword=TEST', 'erp', 'ERP').value.environment).toBe('')
  expect(parseNaturalResourceInput('生产 MySQL 10.0.0.2 port=99999', 'erp', 'ERP').missing).toContain('有效端口')
})
