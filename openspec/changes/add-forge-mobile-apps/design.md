# 实现设计

本次涉及 Web 与原生权限边界，采用 L3。适用 OBJ-01、NAV-03、CTX-01、DENS-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01，无例外。

## 容器与能力

Android WebView 与鸿蒙 ArkWeb 加载同一公共 HTTPS 工作台，原生客户端不是新增业务模块，不增加网页菜单；页面原有项目／会话身份和草稿仍由现有页面管理。首次安装的 WebView 存储独立于浏览器，需要重新登录，不能声称浏览器草稿自动迁入。后端会话、队列、执行与工具授权不改变。

上一轮候选为 Capacitor，本次根据项目源码进一步收敛：`frontend/src/lib/api.ts` 使用相对 `/api`，`useClaudeChatSocket.ts` 使用页面 host；目标又要求跟随线上页面更新，因此使用官方原生容器，避免将 Capacitor 开发用 `server.url` 当正式运行配置，也避免重写全平台网络层。外部来源依据见 mobile/README.md，原生 SDK API 来自官方文档，不自行实现执行器或通用插件平台。

`mobile/forge-mobile.json` 是公共 origin、路由、包名和版本唯一源；Android Gradle 读取，鸿蒙 prepare 生成公开常量与本机忽略的构建文件。DevEco 私有签名与 SDK 标签在本机文件，Android 正式签名经私有环境变量；不打印或提交凭据。Gradle Wrapper 及 distribution 固定 SHA256。缺少 SDK、签名或预期产物明确失败，不用旧包兜底。

## 请求、结果与权限

网页 `nativeMobile.ts` 仅在顶层存在 ForgeNative 时使用原生；普通浏览器保留原实现。version 1 请求为 `{id, version, method, payload}`；仅支持 capabilities/copyText/copyImage/shareImages。Android 在 origin allowlist、sourceOrigin、主 frame 及当前工作台路径上核验；鸿蒙使用 JavaScriptProxy 来源／tools 路径权限及当前页面二次核验。根首页及 `/tools/` 以外的内容不留在特权容器，尤其不能将 `/api/` 下的附件 HTML 作为特权页面打开。主机重启、Shell、SQL、任意文件路径、任意 Intent 和后台自动发送均不在协议中。

原生按请求 ID 保存最近 64 个结果；网页仅处理在途 ID，复制 30 秒／分享 120 秒超时后明确未知，不自动用其他通道重放。鸿蒙分享面板在途拒绝第二个操作；页面离开拒绝在途等待，迟到结果不修改新页面状态。Android reply proxy 回复原 frame，鸿蒙以 JSON 序列化数据发受限页面事件，网页不能提交脚本文本让原生执行。

文本限 100 万字符，PNG 单张 8MB／4000 万像素、最多 8 张、消息 24MB 字符上限；原生二次验证类型与大小，生成随机应用私有缓存路径。不写相册、不读取用户剪贴板。两端只清理应用私有目录中超过 24 小时的临时图片，缓存最多 64 项，避免无限累积；不会在刚打开系统分享后立即删除图片。系统分享表示交接，不表示发送成功；取消、拒绝和未知不宣称成功。

文件选择复用已有 file input → 系统 Picker → 现有附件上传。取消或异常回传空结果，不清除草稿。Android 接入系统相机 URI，鸿蒙 capture 按需申请相机权限后调用 CameraPicker，避免同时触发两个 Picker。麦克风仅在可信页面请求 AUDIO_CAPTURE 时申请，拒绝不自动改用其他账号或服务。关闭或返回沿用网页历史，初始页返回系统；不自动置顶或加常驻工具栏。Android 系统栏与 IME Insets 统一处理，鸿蒙保留系统避让，真实键盘／字体／安全区域需实机验收。

## 交付与验证边界

先完成源码与网页边界回归，再执行 SDK 编译、签名及 Mate 60／鸿蒙 7 真机验证；Android 需要另有 Android 设备。PWA 仍可用，原生能力失败只影响当前操作。服务起停继续遵守 AGENTS，本次不重启 Forge。后台推送需要独立平台接入，未作为已实现能力交付。
