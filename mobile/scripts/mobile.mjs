import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readMobileConfig, prepareHarmony } from './config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const command = process.argv[2] || 'doctor'
const platform = process.argv[3]
const config = readMobileConfig(root)
const defaultAndroidSdk = path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk')
const projectAndroidSdk = path.resolve(root, '../.run/mobile-android-sdk')
const androidSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  || (existsSync(path.join(defaultAndroidSdk, 'platforms/android-36/android.jar')) ? defaultAndroidSdk : projectAndroidSdk)
const deveco = process.env.DEVECO_HOME || ''
const hvigor = process.env.HVIGOR_PATH || (deveco && path.join(deveco, 'tools/hvigor/bin/hvigorw.js'))
const harmonySdk = process.env.DEVECO_SDK_HOME || (deveco && path.join(deveco, 'sdk'))

function run(executable, args, cwd, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, stdio: 'inherit', shell: false, windowsHide: true })
  if (result.error) throw new Error(`无法运行 ${path.basename(executable)}：${result.error.code}`)
  if (result.status !== 0) throw new Error(`构建命令失败，退出码 ${result.status}；请检查原始输出，不重复派发构建`)
}

function deliver(file, name) {
  if (!existsSync(file)) throw new Error('构建未产生预期安装包，不交付空包或旧包')
  const directory = path.join(root, 'dist'); mkdirSync(directory, { recursive: true })
  const output = path.join(directory, name); copyFileSync(file, output)
  const sha = createHash('sha256').update(readFileSync(output)).digest('hex')
  writeFileSync(output + '.sha256', sha + '  ' + name + '\n')
  console.log(`已生成 ${output}\nSHA256 ${sha}\n尚需安装与真机能力验收；构建成功不代表实际可用。`)
}

try {
  if (command === 'doctor') {
    console.log(JSON.stringify({
      java: spawnSync('java', ['-version'], { windowsHide: true }).status === 0,
      android: { sdkInstalled: existsSync(path.join(androidSdk, 'platforms/android-36/android.jar')), wrapperInstalled: existsSync(path.join(root, 'android/gradle/wrapper/gradle-wrapper.jar')) },
      harmony: { sdkInstalled: !!harmonySdk && existsSync(harmonySdk), hvigorInstalled: !!hvigor && existsSync(hvigor), privateSigningConfigured: existsSync(path.join(root, 'harmony/build-profile.local.json5')) },
      origin: config.origin, note: 'doctor 不启动服务、不安装 SDK、不接受许可，也不读取或打印签名凭据'
    }, null, 2))
  } else if (command === 'prepare') {
    prepareHarmony(root, config)
    console.log('已同步两端公共配置与鸿蒙本地构建配置；未构建、签名或安装。')
  } else if (command === 'build' && platform === 'android') {
    if (!existsSync(path.join(androidSdk, 'platforms/android-36/android.jar'))) throw new Error('缺少 Android SDK 36。请通过 Android Studio SDK Manager 安装并设置 ANDROID_HOME，再运行 doctor。')
    const android = path.join(root, 'android')
    if (!existsSync(path.join(android, 'gradle/wrapper/gradle-wrapper.jar'))) throw new Error('缺少固定版本 Gradle Wrapper JAR，请完整拉取 mobile/android/gradle/wrapper')
    const release = process.argv.includes('--release')
    const variant = release ? 'release' : 'debug'
    run('java', ['-classpath', path.join(android, 'gradle/wrapper/gradle-wrapper.jar'), 'org.gradle.wrapper.GradleWrapperMain', '--no-daemon', release ? 'assembleRelease' : 'assembleDebug'], android, { ...process.env, ANDROID_HOME: androidSdk })
    const apk = path.join(android, `app/build/outputs/apk/${variant}/app-${variant}.apk`)
    const tools = readdirSync(path.join(androidSdk, 'build-tools')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    const verifier = tools.map(version => path.join(androidSdk, 'build-tools', version, 'lib/apksigner.jar')).find(existsSync)
    if (!verifier) throw new Error('缺少 SDK apksigner，安装包签名尚未验证，不交付')
    run('java', ['-jar', verifier, 'verify', '--verbose', apk], android)
    deliver(apk, `forge-android-${config.versionName}-${variant}.apk`)
  } else if (command === 'build' && platform === 'harmony') {
    if (!hvigor || !existsSync(hvigor) || !harmonySdk || !existsSync(harmonySdk)) throw new Error('缺少 DevEco/HarmonyOS SDK。设置 DEVECO_HOME 或 HVIGOR_PATH 与 DEVECO_SDK_HOME，然后运行 doctor。')
    const profile = prepareHarmony(root, config)
    if (!profile.app.products[0].signingConfig) throw new Error('缺少鸿蒙真机签名。先在 DevEco/开发者中心配置本应用证书与 Mate 60 设备 Profile，并写入被忽略的 build-profile.local.json5。')
    const harmony = path.join(root, 'harmony')
    const bundledNode = deveco && path.join(deveco, 'tools/node', process.platform === 'win32' ? 'node.exe' : 'bin/node')
    const harmonyNode = process.env.HVIGOR_NODE || (bundledNode && existsSync(bundledNode) ? bundledNode : process.execPath)
    run(harmonyNode, [hvigor, '--mode', 'module', '-p', 'product=default', '-p', 'module=entry@default', '-p', 'buildMode=debug', 'assembleHap', '--no-daemon'], harmony, { ...process.env, DEVECO_SDK_HOME: harmonySdk })
    deliver(path.join(harmony, 'entry/build/default/outputs/default/entry-default-signed.hap'), `forge-harmony-${config.versionName}-debug.hap`)
  } else {
    throw new Error('用法：node mobile/scripts/mobile.mjs doctor | prepare | build android [--release] | build harmony')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : '手机应用构建失败')
  process.exitCode = 1
}
