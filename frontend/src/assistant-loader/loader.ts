import type { AssistantInitOptions, AssistantSdk } from '../assistant-sdk/types'

const DEFAULT_CHANNEL = 'stable'
const MANIFEST_SCHEMA_VERSION = 1
const LOAD_TIMEOUT_MS = 15_000
const CHANNEL_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const VERSION_PATTERN = /^sha256-[a-f0-9]{12}$/
const INTEGRITY_PATTERN = /^sha384-[A-Za-z0-9+/]+={0,2}$/

export interface AssistantRuntime {
  initializeAssistant: (options: AssistantInitOptions) => AssistantSdk
  initialize: (options: AssistantInitOptions) => AssistantSdk
}

export interface LoadedAssistantSdk {
  sdk: AssistantRuntime
  version: string
  channel: string
}

export interface AssistantLoaderOptions {
  channel?: string
  baseUrl?: string
}

export interface AssistantLoader {
  load: (options?: AssistantLoaderOptions) => Promise<LoadedAssistantSdk>
}

interface ReleaseArtifact {
  path: string
  integrity: string
}

interface ReleaseManifest {
  schemaVersion: number
  channel: string
  version: string
  releasedAt: string
  artifacts: {
    iife: ReleaseArtifact
    esm: ReleaseArtifact
  }
}

interface LoaderEnvironment {
  defaultBaseUrl: string
  fetchManifest: (url: string) => Promise<unknown>
  loadScript: (url: string, integrity: string, version: string) => Promise<void>
  runtime: () => AssistantRuntime | undefined
  currentVersion: () => string | undefined
  rememberVersion: (version: string) => void
}

declare global {
  interface Window {
    KaiAssistant?: AssistantRuntime
    KaiAssistantLoader?: AssistantLoader
    __KAI_ASSISTANT_SDK_VERSION__?: string
  }
}

export function createAssistantLoader(environment: LoaderEnvironment): AssistantLoader {
  const loadTasks = new Map<string, Promise<LoadedAssistantSdk>>()

  return {
    load(options = {}) {
      const channel = normalizeChannel(options.channel)
      const baseUrl = normalizeBaseUrl(options.baseUrl ?? environment.defaultBaseUrl)
      const taskKey = `${baseUrl}\0${channel}`
      const existingTask = loadTasks.get(taskKey)
      if (existingTask) return existingTask

      const task = loadRelease(environment, baseUrl, channel).catch((error: unknown) => {
        loadTasks.delete(taskKey)
        throw error
      })
      loadTasks.set(taskKey, task)
      return task
    },
  }
}

async function loadRelease(environment: LoaderEnvironment, baseUrl: string,
  channel: string): Promise<LoadedAssistantSdk> {
  const existingRuntime = environment.runtime()
  const existingVersion = environment.currentVersion()
  if (existingRuntime && existingVersion) {
    return { sdk: existingRuntime, version: existingVersion, channel }
  }

  const manifestUrl = new URL(`channels/${channel}.json`, baseUrl).href
  const manifest = parseManifest(await environment.fetchManifest(manifestUrl), channel)
  const artifactUrl = resolveArtifactUrl(baseUrl, manifest.artifacts.iife.path)
  await environment.loadScript(artifactUrl, manifest.artifacts.iife.integrity, manifest.version)

  const runtime = environment.runtime()
  if (!runtime || typeof runtime.initializeAssistant !== 'function') {
    throw new Error(`KAI Assistant SDK ${manifest.version} did not register a valid runtime`)
  }
  environment.rememberVersion(manifest.version)
  return { sdk: runtime, version: manifest.version, channel }
}

function parseManifest(value: unknown, expectedChannel: string): ReleaseManifest {
  if (!isRecord(value) || value.schemaVersion !== MANIFEST_SCHEMA_VERSION
      || value.channel !== expectedChannel || typeof value.version !== 'string'
      || !VERSION_PATTERN.test(value.version) || typeof value.releasedAt !== 'string'
      || Number.isNaN(Date.parse(value.releasedAt)) || !isRecord(value.artifacts)) {
    throw new Error(`KAI Assistant channel '${expectedChannel}' returned an invalid manifest`)
  }

  const iife = parseArtifact(value.artifacts.iife, 'iife')
  const esm = parseArtifact(value.artifacts.esm, 'esm')
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    channel: expectedChannel,
    version: value.version,
    releasedAt: value.releasedAt,
    artifacts: { iife, esm },
  }
}

function parseArtifact(value: unknown, name: string): ReleaseArtifact {
  if (!isRecord(value) || typeof value.path !== 'string' || !isSafeArtifactPath(value.path)
      || typeof value.integrity !== 'string' || !INTEGRITY_PATTERN.test(value.integrity)) {
    throw new Error(`KAI Assistant manifest contains an invalid ${name} artifact`)
  }
  return { path: value.path, integrity: value.integrity }
}

function resolveArtifactUrl(baseUrl: string, artifactPath: string): string {
  const base = new URL(baseUrl)
  const artifact = new URL(artifactPath, base)
  if (artifact.origin !== base.origin || !artifact.pathname.startsWith(base.pathname)) {
    throw new Error('KAI Assistant artifact escaped the configured SDK base URL')
  }
  return artifact.href
}

function isSafeArtifactPath(path: string): boolean {
  return path.startsWith('releases/') && !path.includes('..') && !path.includes('\\')
      && !path.includes('?') && !path.includes('#')
}

function normalizeChannel(channel = DEFAULT_CHANNEL): string {
  const normalized = channel.trim().toLowerCase()
  if (!CHANNEL_PATTERN.test(normalized)) {
    throw new Error(`Invalid KAI Assistant release channel '${channel}'`)
  }
  return normalized
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = new URL(baseUrl, window.location.href)
  normalized.search = ''
  normalized.hash = ''
  if (!normalized.pathname.endsWith('/')) normalized.pathname += '/'
  return normalized.href
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function browserEnvironment(): LoaderEnvironment {
  const loaderScript = document.currentScript as HTMLScriptElement | null
  const defaultBaseUrl = loaderScript?.src
    ? new URL('./', loaderScript.src).href
    : new URL('/assistant-sdk/', window.location.href).href

  return {
    defaultBaseUrl,
    async fetchManifest(url) {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS)
      try {
        const response = await fetch(url, {
          cache: 'no-cache',
          credentials: 'omit',
          mode: 'cors',
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`KAI Assistant manifest request failed (HTTP ${response.status})`)
        }
        return await response.json()
      } finally {
        window.clearTimeout(timeout)
      }
    },
    loadScript(url, integrity, version) {
      return new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        const timeout = window.setTimeout(() => fail('timed out'), LOAD_TIMEOUT_MS)
        const fail = (reason: string) => {
          window.clearTimeout(timeout)
          script.remove()
          reject(new Error(`KAI Assistant SDK ${version} ${reason}`))
        }
        script.src = url
        script.async = true
        script.crossOrigin = 'anonymous'
        script.integrity = integrity
        script.dataset.kaiAssistantVersion = version
        script.addEventListener('load', () => {
          window.clearTimeout(timeout)
          resolve()
        }, { once: true })
        script.addEventListener('error', () => fail('failed to load or failed SRI validation'), { once: true })
        document.head.append(script)
      })
    },
    runtime: () => window.KaiAssistant,
    currentVersion: () => window.__KAI_ASSISTANT_SDK_VERSION__,
    rememberVersion: version => { window.__KAI_ASSISTANT_SDK_VERSION__ = version },
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.KaiAssistantLoader = createAssistantLoader(browserEnvironment())
}

