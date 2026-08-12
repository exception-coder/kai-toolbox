import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDirectory, '..')
const featuresRoot = path.join(frontendRoot, 'src', 'features')
const baselinePath = path.join(scriptDirectory, 'feature-boundary-baseline.json')
const sourceExtensions = new Set(['.ts', '.tsx'])
const importPattern = /(?:\bfrom\s*|\bimport\s*\()\s*['"](@\/features\/([^/'"]+)(?:\/[^'"]*)?)['"]/g

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(entryPath)
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : []
  }))
  return nestedFiles.flat()
}

function toPortablePath(file) {
  return path.relative(frontendRoot, file).split(path.sep).join('/')
}

function isPublicApiImport(targetFeature, specifier) {
  const publicApi = `@/features/${targetFeature}/public-api`
  return specifier === publicApi || specifier.startsWith(`${publicApi}/`)
}

function importKey(featureImport) {
  return `${featureImport.file}|${featureImport.specifier}`
}

async function collectPrivateCrossFeatureImports() {
  const sourceFiles = await collectSourceFiles(featuresRoot)
  const imports = new Map()

  for (const file of sourceFiles) {
    const relativeFile = toPortablePath(file)
    const sourceFeature = path.relative(featuresRoot, file).split(path.sep)[0]
    const source = await readFile(file, 'utf8')

    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1]
      const targetFeature = match[2]
      if (sourceFeature === targetFeature || isPublicApiImport(targetFeature, specifier)) continue

      const featureImport = { file: relativeFile, specifier }
      imports.set(importKey(featureImport), featureImport)
    }
  }

  return [...imports.values()].sort((left, right) => importKey(left).localeCompare(importKey(right)))
}

async function readBaseline() {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
  if (baseline.version !== 1 || !Array.isArray(baseline.legacyPrivateImports)) {
    throw new Error(`Unsupported feature boundary baseline format: ${baselinePath}`)
  }
  return baseline.legacyPrivateImports
}

function reportDifferences(unexpectedImports, staleAllowances) {
  if (unexpectedImports.length > 0) {
    console.error('New private cross-feature imports are forbidden. Export a public-api from the target feature:')
    for (const featureImport of unexpectedImports) {
      console.error(`  ${featureImport.file} -> ${featureImport.specifier}`)
    }
  }

  if (staleAllowances.length > 0) {
    console.error('Remove these resolved debts from feature-boundary-baseline.json:')
    for (const key of staleAllowances) console.error(`  ${key}`)
  }
}

async function main() {
  const currentImports = await collectPrivateCrossFeatureImports()
  if (process.argv.includes('--print-baseline')) {
    console.log(JSON.stringify({ version: 1, legacyPrivateImports: currentImports }, null, 2))
    return
  }

  const baselineImports = await readBaseline()
  const currentByKey = new Map(currentImports.map((featureImport) => [importKey(featureImport), featureImport]))
  const baselineKeys = new Set(baselineImports.map(importKey))
  const unexpectedImports = currentImports.filter((featureImport) => !baselineKeys.has(importKey(featureImport)))
  const staleAllowances = [...baselineKeys].filter((key) => !currentByKey.has(key)).sort()

  if (unexpectedImports.length > 0 || staleAllowances.length > 0) {
    reportDifferences(unexpectedImports, staleAllowances)
    process.exitCode = 1
    return
  }

  console.log(`Feature boundaries OK: ${currentImports.length} legacy private imports, no new violations.`)
}

main().catch((error) => {
  console.error('Feature boundary check failed:', error)
  process.exitCode = 1
})
