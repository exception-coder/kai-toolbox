import { z } from 'zod'
import { definitions, execute } from './tools.js'

// Legacy recovery remains discoverable without publishing workflow schemas to every model turn.
if (process.argv[2] === '--describe') {
  const definition = definitions.find(item => item.name === process.argv[3])
  if (!definition) {
    process.stdout.write(JSON.stringify({ allowed: false, code: 'TOOL_INVALID', operations: definitions.map(item => item.name) }) + '\n')
    process.exit(2)
  }
  process.stdout.write(JSON.stringify({ name: definition.name, description: definition.description,
    inputSchema: z.toJSONSchema(definition.schema) }) + '\n')
  process.exit(0)
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  raw += chunk
  if (Buffer.byteLength(raw) > 1024 * 1024) { process.stderr.write('INPUT_LIMIT\n'); process.exit(2) }
})
process.stdin.on('end', async () => {
  try {
    const result = await execute(process.argv[2] || 'check_change_readiness', JSON.parse(raw))
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exitCode = result.allowed === false ? 2 : 0
  } catch (error) {
    process.stdout.write(JSON.stringify({ allowed: false, code: 'CHECK_ERROR', message: String(error) }) + '\n')
    process.exitCode = 2
  }
})
