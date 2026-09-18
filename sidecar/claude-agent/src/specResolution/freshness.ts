import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { hash, readText, safePath } from './storage.js'

/** Graphify's manifest hashes raw bytes with MD5 (detect._md5_file), not AST text. */
export function graphFreshness(root: string, sources: string[]) {
  const manifestFile = safePath(root, 'graphify-out/manifest.json')
  if (!fs.existsSync(manifestFile)) return { status: 'UNVERIFIED', revision: 'missing-manifest', reasons: ['Graphify manifest missing'] }
  const manifest = JSON.parse(readText(manifestFile)) as Record<string, { ast_hash?: string; semantic_hash?: string; hash?: string }>
  const reasons: string[] = []; const fingerprints: string[] = []
  for (const source of [...new Set(sources)].sort()) {
    const relative = (path.isAbsolute(source) ? path.relative(root, source) : source).replace(/\\/g, '/')
    try {
      const file = safePath(root, relative)
      if (!fs.existsSync(file)) { reasons.push(`DELETED: ${relative}`); continue }
      const stat = fs.statSync(file)
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024) { reasons.push(`SOURCE_LIMIT: ${relative}`); continue }
      const actual = createHash('md5').update(fs.readFileSync(file)).digest('hex')
      const entry = manifest[relative] || manifest[file] || manifest[file.replace(/\\/g, '/')]
      fingerprints.push(`${relative}:${actual}`)
      if (!entry || typeof entry !== 'object') reasons.push(`UNINDEXED: ${relative}`)
      else if (![entry.ast_hash, entry.semantic_hash, entry.hash].includes(actual)) reasons.push(`CHANGED: ${relative}`)
      // A stale semantic extraction must not be vouched for by a newer AST extraction.
      else if (entry.semantic_hash && entry.semantic_hash !== actual) reasons.push(`SEMANTIC_STALE: ${relative}`)
    } catch { reasons.push(`SOURCE_UNAVAILABLE: ${relative}`) }
  }
  return { status: reasons.length ? 'STALE' : sources.length ? 'VERIFIED_SOURCES' : 'UNVERIFIED',
    revision: hash(JSON.stringify({ manifest, fingerprints, reasons })), reasons }
}
