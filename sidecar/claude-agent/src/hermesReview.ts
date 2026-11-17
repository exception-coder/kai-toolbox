import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { createHash } from 'node:crypto'
import { parse, stringify } from 'yaml'

/** Copy provider configuration only into an attempt-owned home, never plugins, hooks or MCP settings. */
export function hermesReviewEnvironment(cwd: string, parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const source = parent.HERMES_HOME || (process.platform === 'win32'
    ? join(parent.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'hermes') : join(homedir(), '.hermes'))
  const configPath = join(source, 'config.yaml')
  const saved = existsSync(configPath) ? parse(readFileSync(configPath, 'utf8')) ?? {} : {}
  // Native profiles share the installed runtime while keeping config, sessions and tools separate.
  const home = join(source, 'profiles', `forge-review-${createHash('sha256').update(cwd).digest('hex').slice(0, 24)}`)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  writeFileSync(join(home, 'config.yaml'), stringify({ model: saved.model, providers: saved.providers,
    agent: { disabled_toolsets: ['*'], max_turns: 1 }, platform_toolsets: { acp: [] }, mcp_servers: {},
    skills: { disabled: ['*'] } }), { mode: 0o600 })
  const environment: NodeJS.ProcessEnv = { ...parent, HERMES_HOME: home }
  const dotenv = join(source, '.env')
  if (existsSync(dotenv)) {
    for (const [key, value] of Object.entries(parseEnv(readFileSync(dotenv, 'utf8')))) {
      if (/^(?:DEEPSEEK|OPENAI|ANTHROPIC|OPENROUTER|GEMINI|GROQ|XAI|MISTRAL)_(?:API_KEY|BASE_URL|API_BASE)$/.test(key)) environment[key] = value
    }
  }
  return environment
}
