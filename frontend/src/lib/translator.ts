/**
 * Thin wrapper around Chrome's built-in Translator API (stable since Chrome 138).
 * Runs Gemini Nano on-device — no network call, no quota, no auth.
 *
 * <p>Translation is a two-step affair: first {@link availabilityFor} checks whether the
 * target language pair is ready, downloadable, or unsupported; then {@link getTranslator}
 * either uses an existing in-memory instance or creates one (and triggers a one-time model
 * download for the language pair when needed).
 */

export type TranslatorAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

interface ChromeTranslator {
  translate(text: string): Promise<string>
  destroy?: () => void
}

interface TranslatorCreateOptions {
  sourceLanguage: string
  targetLanguage: string
  monitor?: (m: EventTarget) => void
}

interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorAvailability>
  create(opts: TranslatorCreateOptions): Promise<ChromeTranslator>
}

declare global {
  // eslint-disable-next-line no-var
  var Translator: TranslatorStatic | undefined
}

function api(): TranslatorStatic | undefined {
  return typeof globalThis !== 'undefined' ? globalThis.Translator : undefined
}

export function isTranslatorSupported(): boolean {
  return typeof api()?.create === 'function'
}

export async function availabilityFor(source: string, target: string): Promise<TranslatorAvailability> {
  const t = api()
  if (!t) return 'unavailable'
  try {
    return await t.availability({ sourceLanguage: source, targetLanguage: target })
  } catch {
    return 'unavailable'
  }
}

interface CachedEntry {
  pair: string
  translator: Promise<ChromeTranslator>
}

let cached: CachedEntry | null = null

/**
 * Resolve a translator for the language pair. Subsequent calls for the same pair return the
 * same instance (loaded models are expensive to instantiate). Switching to a different pair
 * destroys the previous one — the API caps active models per page.
 *
 * <p>{@link onDownloadProgress} fires {@code 0..1} as the language pack downloads; only the
 * first call for a given pair will see progress, subsequent ones resolve instantly.
 */
export async function getTranslator(
  source: string,
  target: string,
  onDownloadProgress?: (fraction: number) => void,
): Promise<ChromeTranslator> {
  const t = api()
  if (!t) throw new Error('Translator API unavailable in this browser')

  const pair = `${source}->${target}`
  if (cached && cached.pair === pair) return cached.translator

  if (cached) {
    // Best-effort cleanup of the previous translator. Chrome will GC eventually anyway.
    cached.translator
      .then(prev => prev.destroy?.())
      .catch(() => undefined)
    cached = null
  }

  const translator = t.create({
    sourceLanguage: source,
    targetLanguage: target,
    monitor: m => {
      m.addEventListener('downloadprogress', ((e: Event) => {
        const ev = e as Event & { loaded?: number; total?: number }
        if (typeof ev.loaded === 'number') {
          // Modern Chrome reports `loaded` already as a 0..1 fraction; older builds passed
          // bytes with a `total` companion. Cover both shapes.
          const fraction = typeof ev.total === 'number' && ev.total > 0
            ? ev.loaded / ev.total
            : Math.max(0, Math.min(1, ev.loaded))
          onDownloadProgress?.(fraction)
        }
      }) as EventListener)
    },
  })
  cached = { pair, translator }
  return translator
}

/**
 * Lightweight LRU cache for cue text → translation. Keyed by the source string only — pair
 * changes invalidate the parent translator anyway, and the same English line never needs
 * retranslating to the same Chinese during a single viewing session.
 */
const memoCache = new Map<string, string>()
const MEMO_LIMIT = 2048

export async function translateCached(translator: ChromeTranslator, text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const hit = memoCache.get(trimmed)
  if (hit !== undefined) {
    // Refresh recency by re-inserting (Map iteration order = insertion order).
    memoCache.delete(trimmed)
    memoCache.set(trimmed, hit)
    return hit
  }
  const out = await translator.translate(trimmed)
  if (memoCache.size >= MEMO_LIMIT) {
    const firstKey = memoCache.keys().next().value
    if (firstKey !== undefined) memoCache.delete(firstKey)
  }
  memoCache.set(trimmed, out)
  return out
}

/** Whisper.cpp returns ISO 639-1 codes (sometimes with hyphens). Pass through after trimming. */
export function normalizeWhisperLang(code: string | null | undefined): string {
  if (!code) return ''
  return code.trim().toLowerCase().split('-')[0]
}
