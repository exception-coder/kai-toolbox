# Forge 手机客户端

复用线上 Forge 工作台，两套官方原生容器分别服务 Android 与鸿蒙原生手机。用户目标设备为 **Mate 60／HarmonyOS 7**。Android 已通过真实 SDK 编译并生成签名校验通过的内部测试 APK，尚未装机验收；鸿蒙工程与网页适配源码已写入，但本机缺少 DevEco/HarmonyOS SDK、Hvigor 和设备签名，**尚未生成 HAP**。Android APK 不能用于鸿蒙原生手机，不能以网页测试或 APK 编译代替 Mate 60 验收。

## 实现与边界

| 能力 | Android | 鸿蒙 |
|---|---|---|
| 现有页面、登录、会话、队列和上传接口 | WebView 加载同源 HTTPS 站点 | ArkWeb 加载同源 HTTPS 站点 |
| 相册／文件选择 | WebChromeClient 文件选择器，取消回传空结果 | PhotoViewPicker / DocumentViewPicker，取消回传空结果 |
| 拍照上传 | 系统相机输出到受控缓存 URI | CameraPicker，仅主动拍照时申请相机权限 |
| 文本复制 | Android ClipboardManager | HarmonyOS Pasteboard |
| 复制卡片图片 | FileProvider 图片 URI | PNG 解码为 PixelMap 后写剪贴板 |
| 分享卡片图片 | 系统 Sharesheet，一次交接整批图片 | Share Kit，BATCH 整批图片 |
| 现有 Web 语音 | 仅可信来源、仅麦克风，按需申请系统权限 | 仅可信来源、仅麦克风，按需申请系统权限 |
| 后台任务完成推送 | 未实现 | 未实现 |

Android 原生列已通过 SDK 编译，鸿蒙原生列仍是未编译源码状态；两端实际系统行为均未装机验收。分享结果只表示“已交给系统”，不表示已经发送到飞书、企微或钉钉。图片仅写入应用私有临时缓存，不主动保存到相册；系统剪贴板和分享接收端是否接受，须在对应手机及目标软件验证。

手机不运行 Java、Sidecar 或编码引擎；Agent 继续在现有 Forge 主机执行。应用依赖服务可达，不承诺离线运行。原生壳不会获得任意文件、Shell、SQL 或自动发送权限。

## 目录与配置

- `android/`：Java 21、Android SDK 36、AGP 8.13.2、Gradle 8.13，最低 Android 8（API 26）。
- `harmony/`：Stage 模型、ArkTS + ArkWeb、Share Kit，兼容基线 API 12；Mate 60／鸿蒙 7 是待验收目标，不声称已通过该设备验证。
- `forge-mobile.json`：唯一公共配置，含 HTTPS origin、默认站内路由、包名和版本。
- `scripts/mobile.mjs`：环境检查、配置同步、构建及安装包校验／收集。
- 网页协议：[`frontend/src/lib/nativeMobile.ts`](../frontend/src/lib/nativeMobile.ts)，当前 version 为 1。

默认连接 `https://kai-tool.exception-coder.com/tools/claude-chat`。只允许配置不含凭据、路径、查询参数的 HTTPS 域名，不能填入携带 Token 的链接。修改配置后执行：

```powershell
node mobile/scripts/mobile.mjs prepare
node mobile/scripts/mobile.mjs doctor
```

`prepare` 同步鸿蒙公开常量、AppScope 包信息并生成被忽略的构建配置；Android 构建直接读取同一份配置。页面更新沿用 Forge 现有发布流程；原生能力／协议变更需要重新发布手机包。首次打开需要在应用里登录，浏览器 Cookie 和草稿不会自动迁入应用；不要因此复制登录 Token。

选择官方 WebView 而非 Capacitor `server.url` 的原因：当前 Forge HTTP 与 WebSocket 都依赖页面同源，原生壳需要沿用在线前端更新。保留官方网页容器可以避免复制业务 UI 或改造全平台网络与登录层；Capacitor 官方将 `server.url` 定位为开发热重载用途。

## Android 构建与安装

1. 使用 Android Studio SDK Manager 安装 Android SDK Platform 36、Build Tools 35.0.0（AGP 的默认版本）、Platform Tools，按官方流程处理 SDK 许可。设置 `ANDROID_HOME`，Java 21 可沿用本机 JDK。
2. 执行 doctor；SDK 检查为 true 后构建：

```powershell
node mobile/scripts/mobile.mjs build android
```

Gradle Wrapper JAR 来自 Gradle 官方仓库，已与官方 SHA256 核对；distribution 同样固定 SHA256。首次构建会下载锁定的 Gradle 和 Maven 依赖。构建脚本用 SDK apksigner 校验实际 APK 签名，成功后才收集到：

`mobile/dist/forge-android-0.1.0-debug.apk`，旁边是 SHA256 文件。Debug 包用于内部测试；Android 安装时可能需要用户允许当前来源安装。设备已连接并允许调试时，可以人工执行：

```powershell
adb install -r mobile/dist/forge-android-0.1.0-debug.apk
```

本次已通过 Google 官方 Android CLI 在 `.run/mobile-android-sdk` 准备 SDK，脚本在没有显式环境变量和默认 SDK 时可复用该目录。命令行工具 ZIP 与官方仓库元数据 SHA1 核对，Gradle distribution 与 SHA256 核对；下载及缓存不进入 Git。当前官方 CLI 的依赖安装使用 `android --no-metrics --sdk <目录> sdk install platforms/android-36` 和 `sdk install build-tools/35.0.0`，未运行会修改 Agent 配置的 `android init`。有本机代理时，Java 构建需使用已有的私有 Gradle/JVM 代理配置；不要提交代理地址或凭据。

正式签名通过私有环境变量 `FORGE_ANDROID_KEYSTORE`、`FORGE_ANDROID_STORE_PASSWORD`、`FORGE_ANDROID_KEY_ALIAS`、`FORGE_ANDROID_KEY_PASSWORD` 配置，然后使用 `build android --release`。缺少签名时拒绝正式版交付；证书、密码、debug keystore 和产物都不能提交。后续升级需保留原签名，否则无法覆盖安装。不要将签名密码填写到命令参数或聊天记录。

## 鸿蒙构建与 Mate 60 安装

1. 在华为官方 DevEco Studio 安装 HarmonyOS SDK；先使用项目 API 12 基线，或在本机私有配置中选择已安装且支持上述 API 的编译 SDK。不要按“鸿蒙 7”名称猜 API 数字。
2. 设置 `DEVECO_HOME` 为 IDE 目录；自动寻找 `tools/hvigor/bin/hvigorw.js` 和 `sdk`。不同安装结构可分别设置 `HVIGOR_PATH` 与 `DEVECO_SDK_HOME`。在 DevEco 打开 `mobile/harmony/`，让官方工具完成依赖与 SDK 同步。
3. 使用自己的华为开发者账号，申请 `com.exceptioncoder.forge.mobile` 的调试证书与 Profile，将 Mate 60 注册为调试设备。签名配置由用户在 DevEco／开发者中心完成，不在聊天中传证书密码。
4. 把 DevEco 生成的签名配置保存在被忽略的 `mobile/harmony/build-profile.local.json5`。该私有文件使用严格 JSON，格式为：

```json
{
  "sdkVersion": "5.0.0(12)",
  "signingConfigs": [
    {
      "name": "local-device",
      "type": "HarmonyOS",
      "material": {
        "certpath": "本机调试证书路径",
        "profile": "包含 Mate 60 的调试 Profile 路径",
        "storeFile": "本机私钥库路径",
        "keyAlias": "本机别名",
        "storePassword": "由 DevEco 生成的密码配置",
        "keyPassword": "由 DevEco 生成的密码配置",
        "signAlg": "SHA256withECDSA"
      }
    }
  ]
}
```

这是格式说明，示例路径和密码不是可用凭据。保留 DevEco 实际生成的 material 字段，不把示例覆盖到已有证书。`prepare` 会把签名合并到同样被忽略的 `harmony/build-profile.json5`，不会写入公开源码。修改模板后重新 prepare。

```powershell
node mobile/scripts/mobile.mjs prepare
node mobile/scripts/mobile.mjs doctor
node mobile/scripts/mobile.mjs build harmony
```

仅实际生成 `entry-default-signed.hap` 才会收集为 `mobile/dist/forge-harmony-0.1.0-debug.hap`。本机 SDK 编译和签名尚未跑通，产物路径与具体 SDK 工具行为仍需实际核验。可在 DevEco 对 Mate 60 Run，或在已授权调试设备执行 `hdc install -r <signed.hap>`。调试 Profile 仅适用于其登记设备；团队分发须按华为当前测试／发布渠道处理，不能把一个人的调试包当作任意手机通用安装包。

## 能力与安全合同

Android 使用 AndroidX WebKit 的 origin allowlist，并要求调用来自主 frame；鸿蒙使用 JavaScriptProxy origin 与 tools 路径 permission，并再次核对当前页面 URL。容器只允许根首页及 `/tools/` 工作台导航，不把 `/api/` 附件 HTML 等内容当作可调用原生能力的页面。两端拒绝不可信导航、混合内容和证书错误，不使用忽略证书或全域桥接。外部普通链接经用户手势交给系统浏览器。原生回执只携带当前请求结果，不携带登录 Token 或读取剪贴板内容。

协议仅允许 `capabilities`、`copyText`、`copyImage`、`shareImages`。图片仅接受 PNG，每张最多 8MB／4000 万像素，一次最多 8 张，消息总长有界；原生端自行生成缓存文件名，不接受网页文件路径或任意 Intent。结果使用请求 ID 关联并有界去重；超时显示“结果未确认”，不会自动切浏览器重放分享。页面离开取消网页等待，迟到结果不回填新任务。

## 验证

```powershell
node --test mobile/scripts/config.test.mjs
# 在 frontend 下执行：
npx vitest run src/lib/nativeMobile.test.ts src/features/claude-chat/lib/clipboard.test.ts src/features/markdown-card/lib/sharing.test.ts --maxWorkers=1
npm run typecheck
```

原生 origin 纯 Java 测试不需要 Android SDK，见 `android/policy-test/OriginPolicyTest.java`；它不验证 Android 系统 API。SDK 缺失时，doctor 和 build 应明确失败，不自动安装工具、接受许可、制造空包或交付旧包。

真机验收需覆盖：安装／覆盖升级、登录续期、现有项目与草稿、照片多选与取消、拍照、图片复制和整批分享、麦克风拒绝与恢复、键盘及安全区域、返回及切回应用、会话流式输出和排队／停止、不可信页面无桥接能力。所有操作用测试内容；分享系统面板打开不等于实际发送。当前缺口及实际证据统一记在 [实施任务](../openspec/changes/add-forge-mobile-apps/tasks.md)。

## 官方依据（2026-11-08 核对）

- [Android 官方 WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview)、[WebViewCompat 消息桥](https://developer.android.com/reference/androidx/webkit/WebViewCompat)、[原生桥安全](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)
- [AGP 8.13.2 兼容矩阵](https://developer.android.com/build/releases/agp-8-13-0-release-notes)、[Capacitor server.url 边界](https://capacitorjs.com/docs/config)
- [Android 官方 CLI 与数据采集开关](https://developer.android.com/tools/agents/android-cli)
- [ArkWeb](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/web-component-overview/)、[网页调用原生方法及来源权限](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/web-in-page-app-function-invoking/)、[文件上传](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/web-file-upload/)
- [Share Kit](https://developer.huawei.com/consumer/en/doc/harmonyos-references/share-system-share/)、[真机调试签名](https://developer.huawei.com/consumer/cn/doc/app/agc-help-debug-overview-0000001955332054/)
