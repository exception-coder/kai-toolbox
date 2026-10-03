import fs from 'node:fs'
import path from 'node:path'
import { requireCondition } from '../specResolution/contracts.js'
import { safePath } from '../specResolution/storage.js'

/** Accept absolute paths only after converting them back to a checked project path. */
export function verificationPath(root: string, value: string) {
  const relative = path.isAbsolute(value) ? path.relative(root, value) : value
  return safePath(root, relative)
}

/** Known npm CLIs run through Node on Windows, without interpreting a .cmd shell. */
export function verificationCommand(program: string, args: string[], cwd: string, platform = process.platform) {
  if (program === 'node' || program === 'node.exe') return { program: process.execPath, args }
  const cli = path.basename(program).replace(/\.cmd$/i, '').toLowerCase()
  if (platform !== 'win32' || !['openspec', 'npm', 'npx'].includes(cli)) return { program, args }
  const packageName = cli === 'openspec' ? '@fission-ai/openspec' : 'npm'
  const searchPath = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? ''
  const directories = path.isAbsolute(program) ? [path.dirname(program)]
    : [path.join(cwd, 'node_modules', '.bin'), ...searchPath.split(path.delimiter)]
  for (const directory of directories) {
    const candidates = [path.join(directory, 'node_modules', packageName), path.resolve(directory, '..', packageName)]
    for (const packageRoot of candidates) {
      const manifest = path.join(packageRoot, 'package.json')
      if (!fs.existsSync(manifest)) continue
      const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: string; bin?: string | Record<string, string> }
      if (metadata.name !== packageName) continue
      const entry = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.[cli]
      if (!entry) continue
      const script = safePath(packageRoot, entry)
      if (fs.existsSync(script)) return { program: process.execPath, args: [script, ...args] }
    }
  }
  requireCondition(false, 'CHECK_EXECUTABLE_NOT_FOUND', `未找到 ${cli} 的 Node 入口；安装对应 CLI 或传 program=node、args=[入口脚本,...参数]，不要重复原请求`)
}
