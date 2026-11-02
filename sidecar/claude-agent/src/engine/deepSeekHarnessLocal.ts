import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'

// Keep the backend-owned key out of the ambient environment inherited by other engines.
const managedKey = process.env.KAI_DEEPSEEK_HARNESS_API_KEY?.trim()
delete process.env.KAI_DEEPSEEK_HARNESS_API_KEY

export const harnessHome = () => join(homedir(), '.kai-toolbox', 'deepseek-harness')

/** Read one native credential; never copy the store or expose its contents in diagnostics. */
export function harnessEnvironment(parent: NodeJS.ProcessEnv, credentialFile = join(homedir(), '.dsh', '.credentials.yaml')): NodeJS.ProcessEnv {
  let key = parent.KAI_DEEPSEEK_HARNESS_API_KEY?.trim() || parent.DEEPSEEK_API_KEY?.trim()
    || (parent === process.env ? managedKey : undefined)
  if (!key && existsSync(credentialFile)) {
    try {
      const document = parse(readFileSync(credentialFile, 'utf8')) as { version?: unknown; refs?: Record<string, unknown> }
      const saved = document?.version === 1 ? document.refs?.DEEPSEEK_API_KEY : undefined
      if (typeof saved === 'string') key = saved.trim()
    } catch { throw new Error('DeepSeek 原生凭据文件无法读取，请在 Harness 中检查 Key 配置') }
  }
  if (!key) throw new Error('未找到 DeepSeek Key，请在本机 Harness 中登记或配置 DEEPSEEK_API_KEY')
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(parent)) {
    if (!/TOKEN|SECRET|PASSWORD|API_KEY|AUTH|CREDENTIAL|COOKIE/i.test(name) && !/^DSH_/i.test(name)) env[name] = value
  }
  env.DEEPSEEK_API_KEY = key
  env.DSH_PERMISSION_MODE = 'workspace-write'
  env.DSH_MAX_TOKENS_AS_SUCCESS = 'false'
  return env
}

export function sameWorkspace(first: string, second: string): boolean {
  const canonical = (path: string) => {
    const result = realpathSync(resolve(path))
    return process.platform === 'win32' ? result.toLowerCase() : result
  }
  return canonical(first) === canonical(second)
}

/** The marker records identity only. Missing/corrupt native history must never silently become a new session. */
export async function bindHarnessSession(client: {
  resumeSession(id: string): Promise<void>
  getWorkingDirectory(id: string): Promise<string>
}, home: string, id: string, cwd: string): Promise<void> {
  const marker = join(home, 'forge-bindings', `${createHash('sha256').update(id).digest('hex')}.json`)
  if (existsSync(marker)) {
    let saved: { sessionId?: unknown; cwd?: unknown }
    try { saved = JSON.parse(readFileSync(marker, 'utf8')) } catch { throw new Error('Harness 会话绑定损坏，未创建替代会话') }
    if (saved.sessionId !== id || typeof saved.cwd !== 'string' || !sameWorkspace(saved.cwd, cwd)) {
      throw new Error('Harness 会话与当前工作目录不一致，已阻止跨项目恢复')
    }
    await client.resumeSession(id)
  }
  const effective = await client.getWorkingDirectory(id)
  if (!sameWorkspace(effective, cwd)) throw new Error('Harness 实际工作目录不一致，未发送消息')
  if (!existsSync(marker)) {
    mkdirSync(dirname(marker), { recursive: true })
    const temporary = `${marker}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify({ version: 1, sessionId: id, cwd: resolve(cwd) }), { mode: 0o600 })
    renameSync(temporary, marker)
  }
}
