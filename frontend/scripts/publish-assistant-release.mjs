import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_CHANNEL = 'stable'
const ALLOWED_CHANNELS = new Set(['stable', 'canary'])
const ARTIFACT_FILES = {
  iife: 'kai-assistant.iife.js',
  esm: 'kai-assistant.es.js',
}

export function publishAssistantRelease({
  frontendRoot,
  channel = DEFAULT_CHANNEL,
  releasedAt = new Date().toISOString(),
}) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`Unsupported Assistant release channel '${channel}'`)
  }

  const distributionRoot = path.join(frontendRoot, 'dist-assistant')
  const publicRoot = path.join(frontendRoot, 'public', 'assistant-sdk')
  const iifeBytes = readFileSync(path.join(distributionRoot, ARTIFACT_FILES.iife))
  const releaseId = `sha256-${digest(iifeBytes, 'sha256', 'hex').slice(0, 12)}`
  const releaseRoot = path.join(publicRoot, 'releases', releaseId)
  mkdirSync(releaseRoot, { recursive: true })

  const artifacts = {}
  for (const [format, fileName] of Object.entries(ARTIFACT_FILES)) {
    const source = path.join(distributionRoot, fileName)
    const bytes = readFileSync(source)
    copyFileSync(source, path.join(releaseRoot, fileName))
    artifacts[format] = {
      path: `releases/${releaseId}/${fileName}`,
      integrity: `sha384-${digest(bytes, 'sha384', 'base64')}`,
    }
  }

  const manifest = {
    schemaVersion: 1,
    channel,
    version: releaseId,
    releasedAt,
    artifacts,
  }
  writeJson(path.join(releaseRoot, 'manifest.json'), manifest)
  const channelsRoot = path.join(publicRoot, 'channels')
  mkdirSync(channelsRoot, { recursive: true })
  writeJson(path.join(channelsRoot, `${channel}.json`), manifest)
  return manifest
}

function digest(bytes, algorithm, encoding) {
  return createHash(algorithm).update(bytes).digest(encoding)
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readChannel(arguments_) {
  const argument = arguments_.find(value => value.startsWith('--channel='))
  return argument ? argument.slice('--channel='.length) : process.env.ASSISTANT_RELEASE_CHANNEL || DEFAULT_CHANNEL
}

const modulePath = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const frontendRoot = path.resolve(path.dirname(modulePath), '..')
  const manifest = publishAssistantRelease({ frontendRoot, channel: readChannel(process.argv.slice(2)) })
  process.stdout.write(`Assistant SDK ${manifest.version} published to ${manifest.channel}\n`)
}

