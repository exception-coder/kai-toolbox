import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { saveJson } from './storage.js'

// Explicit installer; importing the service or calling a read-only tool never changes host configuration.
const cli = fileURLToPath(new URL('./cli.js', import.meta.url))
if (!fs.existsSync(cli)) throw new Error('Build the sidecar before installing the hook runtime')
const config = path.join(os.homedir(), '.kai-toolbox', 'forge-spec-resolution.json')
saveJson(config, { protocolVersion: 2, cli, installedAt: new Date().toISOString() })
process.stdout.write(JSON.stringify({ installed: true, config, cli }) + '\n')
