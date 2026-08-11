import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { AlwaysOnSampler, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base'
import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME, ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

let sdk: NodeSDK | undefined
let enabled = false

export function initializeTelemetry(): boolean {
  if (!isEnabled()) return false
  const endpoint = resolveEndpoint()
  if (!endpoint?.trim()) return false
  try {
    if (process.env.TOOLBOX_OBSERVABILITY_DIAGNOSTIC === 'true') {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN)
    }
    const serviceBase = process.env.OTEL_SERVICE_NAME?.trim() || 'kai-toolbox'
    const exporter = new OTLPTraceExporter({
      url: normalizeTraceEndpoint(endpoint),
      headers: resolveHeaders(endpoint),
      timeoutMillis: Math.max(100, Number(process.env.TOOLBOX_OBSERVABILITY_EXPORT_TIMEOUT_MS) || 3000),
    })
    sdk = new NodeSDK({
      traceExporter: exporter,
      sampler: new ParentBasedSampler({ root: rootSampler() }),
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: `${serviceBase}-agent-sidecar`,
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.TOOLBOX_DEPLOYMENT_ENVIRONMENT || 'local',
      }),
    })
    sdk.start()
    enabled = true
    console.log(`[telemetry] OTLP HTTP enabled endpoint=${normalizeTraceEndpoint(endpoint)}`)
    return true
  } catch (error) {
    console.error('[telemetry] 初始化失败，已降级为 No-op:', error instanceof Error ? error.message : String(error))
    sdk = undefined
    enabled = false
    return false
  }
}

function rootSampler(): AlwaysOnSampler | TraceIdRatioBasedSampler {
  const configured = Number(process.env.TOOLBOX_OBSERVABILITY_SAMPLE_RATIO)
  const ratio = Number.isFinite(configured) ? Math.max(0, Math.min(1, configured)) : 1
  return ratio >= 1 ? new AlwaysOnSampler() : new TraceIdRatioBasedSampler(ratio)
}

export function telemetryEnabled(): boolean {
  return enabled
}

export async function shutdownTelemetry(): Promise<void> {
  const current = sdk
  sdk = undefined
  enabled = false
  if (!current) return
  try {
    await current.shutdown()
  } catch (error) {
    console.error('[telemetry] shutdown failed:', error instanceof Error ? error.message : String(error))
  }
}

export function normalizeTraceEndpoint(raw: string): string {
  let endpoint = raw.trim().replace(/\/+$/, '')
  if (!endpoint.endsWith('/v1/traces')) endpoint += '/v1/traces'
  return endpoint
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {}
  const headers: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const index = entry.indexOf('=')
    if (index <= 0) continue
    const key = decodeURIComponent(entry.slice(0, index).trim())
    const value = decodeURIComponent(entry.slice(index + 1).trim())
    if (key && value) headers[key] = value
  }
  return headers
}

function resolveEndpoint(): string | undefined {
  const configured = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (configured?.trim()) return configured.trim()
  const base = process.env.LANGFUSE_BASE_URL?.trim().replace(/\/+$/, '')
  return base ? `${base}/api/public/otel` : undefined
}

function resolveHeaders(endpoint: string): Record<string, string> {
  const headers = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
  if (!endpoint.includes('/api/public/otel')) return headers
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'x-langfuse-ingestion-version')) {
    headers['x-langfuse-ingestion-version'] = '4'
  }
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY
    const secretKey = process.env.LANGFUSE_SECRET_KEY
    if (publicKey && secretKey) {
      headers.Authorization = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`
    }
  }
  return headers
}

function isEnabled(): boolean {
  if (process.env.OTEL_SDK_DISABLED?.toLowerCase() === 'true') return false
  return process.env.TOOLBOX_OBSERVABILITY_ENABLED?.toLowerCase() === 'true'
}
