import { execute } from './tools.js'

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  raw += chunk
  if (Buffer.byteLength(raw) > 1024 * 1024) { process.stderr.write('INPUT_LIMIT\n'); process.exit(2) }
})
process.stdin.on('end', () => {
  try {
    const result = execute(process.argv[2] || 'check_change_readiness', JSON.parse(raw))
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exitCode = result.allowed === false ? 2 : 0
  } catch (error) {
    process.stdout.write(JSON.stringify({ allowed: false, code: 'CHECK_ERROR', message: String(error) }) + '\n')
    process.exitCode = 2
  }
})
