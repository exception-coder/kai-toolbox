import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function readMobileConfig(root) {
  const config = JSON.parse(readFileSync(path.join(root, 'forge-mobile.json'), 'utf8'))
  const url = new URL(config.origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)
    || !/^[a-z0-9.-]+$/i.test(url.hostname)) throw new Error('origin 必须是无凭据、路径或查询参数的 HTTPS 域名')
  if (!/^\/tools\/[a-z\d/_-]+$/i.test(config.startPath)) throw new Error('startPath 必须是 /tools/ 下的工作台路径')
  if (!/^[a-z][a-z\d_]*(\.[a-z][a-z\d_]*){2,}$/i.test(config.applicationId)) throw new Error('无效 applicationId')
  if (!Number.isSafeInteger(config.versionCode) || config.versionCode < 1 || !/^\d+\.\d+\.\d+$/.test(config.versionName)) throw new Error('无效应用版本')
  return { ...config, origin: url.origin }
}

export function prepareHarmony(root, config) {
  const base = path.join(root, 'harmony')
  const profile = JSON.parse(readFileSync(path.join(base, 'build-profile.template.json'), 'utf8'))
  const privateProfile = path.join(base, 'build-profile.local.json5')
  const generatedProfile = path.join(base, 'build-profile.json5')
  if (!existsSync(privateProfile) && existsSync(generatedProfile)) {
    let existing
    try { existing = JSON.parse(readFileSync(generatedProfile, 'utf8')) }
    catch { throw new Error('现有鸿蒙构建配置含手工内容或 JSON5，请先备份或迁入私有配置；未覆盖原文件') }
    if (existing.app?.signingConfigs?.length) throw new Error('发现 DevEco 已配置的签名，请先保存到 build-profile.local.json5；未覆盖原文件')
  }
  if (existsSync(privateProfile)) {
    // Deliberately strict JSON: no evaluation and no secrets in command arguments or logs.
    let local
    try { local = JSON.parse(readFileSync(privateProfile, 'utf8')) }
    catch { throw new Error('鸿蒙私有构建配置不是有效的严格 JSON；请检查格式，原始内容不会输出') }
    if (local.signingConfigs) {
      if (!Array.isArray(local.signingConfigs) || local.signingConfigs.length !== 1 || typeof local.signingConfigs[0].name !== 'string') {
        throw new Error('私有 signingConfigs 必须仅包含本应用一个签名配置')
      }
      profile.app.signingConfigs = local.signingConfigs
      profile.app.products[0].signingConfig = local.signingConfigs[0].name
    }
    if (local.sdkVersion) {
      if (!/^\d+\.\d+\.\d+\(\d+\)$/.test(local.sdkVersion)) throw new Error('sdkVersion 必须与 DevEco 已安装的 SDK 标签一致，例如 5.0.0(12)')
      profile.app.products[0].compileSdkVersion = local.sdkVersion
    }
  }
  writeFileSync(generatedProfile, JSON.stringify(profile, null, 2) + '\n')
  const url = new URL(config.origin)
  const permission = { javascriptProxyPermission: { urlPermissionList: [{ scheme: 'https', host: url.hostname, port: url.port || '443', path: 'tools/' }] } }
  const constants = `// Generated from mobile/forge-mobile.json by node mobile/scripts/mobile.mjs prepare.\nexport const FORGE_ORIGIN: string = ${JSON.stringify(config.origin)};\nexport const FORGE_PATH: string = ${JSON.stringify(config.startPath)};\nexport const FORGE_PROXY_PERMISSION: string = ${JSON.stringify(JSON.stringify(permission))};\n\nexport function isForgeUrl(value: string): boolean {\n  if (value === FORGE_ORIGIN || value === FORGE_ORIGIN + '/') { return true; }\n  if (!value.startsWith(FORGE_ORIGIN + '/tools/')) { return false; }\n  try {\n    const decoded = decodeURIComponent(value.split('?')[0].split('#')[0]);\n    return !decoded.includes('/../') && !decoded.includes('/./') && !decoded.includes(String.fromCharCode(92));\n  } catch { return false; }\n}\n`
  writeFileSync(path.join(base, 'entry/src/main/ets/ForgeConfig.ets'), constants)
  const appPath = path.join(base, 'AppScope/app.json5')
  const app = JSON.parse(readFileSync(appPath, 'utf8'))
  app.app.bundleName = config.applicationId; app.app.versionCode = config.versionCode; app.app.versionName = config.versionName
  writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n')
  return profile
}
