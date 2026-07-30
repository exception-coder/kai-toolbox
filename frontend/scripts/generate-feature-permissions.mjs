import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const featuresDir = path.join(frontendDir, 'src', 'features')
const outputFile = path.join(frontendDir, 'public', 'feature-menu-permissions.json')
const checkOnly = process.argv.includes('--check')

const manifests = fs.readdirSync(featuresDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(featuresDir, entry.name, 'index.tsx'))
  .filter((file) => fs.existsSync(file))
  .map(readManifest)

validateUnique(manifests, 'id')

const permissions = manifests
  .filter((manifest) => manifest.hidden !== true && manifest.layout !== 'showcase')
  .map((manifest) => {
    const code = manifest.requiredPermission ?? `menu:${manifest.id}`
    return {
      featureId: manifest.id,
      code,
      name: manifest.name,
      // 显式权限码通常还有同模块的 BUTTON 子权限，需要与父 MENU 落在同一 module。
      // 普通 menu:<id> 则沿用 FeatureManifest.group，成为 Permission Explorer 的一级分类。
      module: manifest.requiredPermission ? manifest.id : (manifest.group ?? '其他'),
      sort: manifest.order ?? 100,
    }
  })
  .sort((a, b) => a.sort - b.sort || compareAscii(a.featureId, b.featureId))

validateUnique(permissions, 'code')

const catalog = {
  schemaVersion: 1,
  generatedFrom: 'frontend/src/features/*/index.tsx',
  permissions,
}
const next = `${JSON.stringify(catalog, null, 2)}\n`
const current = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : null

if (checkOnly) {
  if (current !== next) {
    console.error(
      '[feature-permissions] 生成目录已过期。请运行 `npm run feature-catalog:generate`，'
      + '或直接执行 `npm run build` 自动更新。',
    )
    process.exit(1)
  }
  console.log(`[feature-permissions] OK：${permissions.length} 个菜单权限与 FeatureManifest 一致`)
} else if (current === next) {
  console.log(`[feature-permissions] 无变化：${permissions.length} 个菜单权限`)
} else {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, next, 'utf8')
  console.log(`[feature-permissions] 已生成 ${path.relative(frontendDir, outputFile)}（${permissions.length} 个菜单权限）`)
}

function readManifest(file) {
  const sourceText = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let object = null

  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return
    for (const declaration of node.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name)
        && declaration.name.text === 'manifest'
        && declaration.initializer
        && ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        object = declaration.initializer
      }
    }
  })

  if (!object) fail(file, '没有找到 `const manifest = { ... }` 对象')

  return {
    id: readString(object, 'id', file, true),
    name: readString(object, 'name', file, true),
    group: readString(object, 'group', file, false),
    order: readNumber(object, 'order', file),
    layout: readString(object, 'layout', file, false),
    hidden: readBoolean(object, 'hidden', file),
    requiredPermission: readString(object, 'requiredPermission', file, false),
  }
}

function findProperty(object, key) {
  return object.properties.find((property) => {
    if (!ts.isPropertyAssignment(property)) return false
    if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) return property.name.text === key
    return false
  })
}

function readString(object, key, file, required) {
  const property = findProperty(object, key)
  if (!property) {
    if (required) fail(file, `缺少必填字段 \`${key}\``)
    return undefined
  }
  const value = property.initializer
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text
  fail(file, `字段 \`${key}\` 必须是字符串字面量，才能生成后端权限目录`)
}

function readNumber(object, key, file) {
  const property = findProperty(object, key)
  if (!property) return undefined
  if (ts.isNumericLiteral(property.initializer)) return Number(property.initializer.text)
  fail(file, `字段 \`${key}\` 必须是数字字面量，才能生成后端权限目录`)
}

function readBoolean(object, key, file) {
  const property = findProperty(object, key)
  if (!property) return undefined
  if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) return true
  if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) return false
  fail(file, `字段 \`${key}\` 必须是布尔字面量，才能生成后端权限目录`)
}

function validateUnique(items, key) {
  const seen = new Map()
  for (const item of items) {
    const value = item[key]
    if (seen.has(value)) {
      throw new Error(`[feature-permissions] 重复的 ${key}：${value}`)
    }
    seen.set(value, item)
  }
}

function compareAscii(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function fail(file, message) {
  throw new Error(`[feature-permissions] ${path.relative(frontendDir, file)}：${message}`)
}
