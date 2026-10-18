import { expect, it } from 'vitest'
import { parseResourceInput } from './parseResourceInput'

it('keeps secret punctuation, parses only known fields and refuses invalid environments and ports', () => {
  const result = parseResourceInput('host=127.0.0.1\n端口:1521\nusername=test\npassword="p:a=s sword"\nenv=prod\n__proto__=bad\nport=999999\nenv=whatever')
  expect(result.patch).toEqual({ host: '127.0.0.1', port: 1521, username: 'test', password: 'p:a=s sword', environment: 'PROD' })
  expect(result.unknown).toBe(3)
  expect(Object.getPrototypeOf(result.patch)).toBe(Object.prototype)
})
