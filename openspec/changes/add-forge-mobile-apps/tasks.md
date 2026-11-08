# 实施与真实证据

- [x] 1. 核对现有 PWA、同源网络与官方容器／原生桥；双端范围确认，目标 Mate 60／鸿蒙 7。
- [x] 2. 写入 Android 与鸿蒙工程、来源受限的能力协议、文件选择和原生复制／分享接线。
- [x] 3. 公共配置、私有签名隔离、doctor、构建及实际产物收集入口；Gradle Wrapper 与官方 SHA256 核对。
- [x] 4a. Android 真实 SDK 编译及 apksigner 校验；资源、Java、Dex、打包实际执行。
- [ ] 4b. 鸿蒙 SDK 编译并修复暴露的问题，核对缓存清理、来源权限及页面重载回执隔离，不能以纯 Java 或网页测试代替。
- [x] 5. 完成网页专项、类型、隔离构建、规格与项目门禁，核对受影响文档和图件。
- [ ] 6. Android 签名 APK 和 Mate 60 对应签名 HAP 实际交付；运行版本、安装、登录、附件、复制／分享、语音和键盘回归。

## 2026-11-08 当前证据

- 配置安全测试 3 项通过；网页原生协议及既有复制／分享相关测试 15 项通过。
- Android 来源策略 4 个可信及 10 个恶意 URL 案例通过；使用本机 Java 21 编译执行，不是 Android SDK 编译或 WebView 测试。
- doctor：Java 与固定 Gradle Wrapper 可用，Android SDK 36、DevEco/HarmonyOS SDK、Hvigor 和鸿蒙私有签名未发现。
- Android 与鸿蒙 build 均退出 1，分别报告缺少 Android SDK 36、缺少 DevEco/HarmonyOS SDK；未生成安装包，未接受 SDK 许可或创建证书，未安装到手机。
- 用户已明确要求两端同时实施，目标设备 Mate 60／鸿蒙 7。已询问既有 SDK 路径与鸿蒙设备签名状态，等待信息期间继续独立源码与验证工作。

## 后续推进证据

- Android SDK 缺口已继续处理：从 Google 官方仓库元数据下载命令行工具并核对 SHA1，使用官方 CLI 安装 Platform 36、Build Tools 35.0.0、Platform Tools 到项目临时目录；未修改全局工具版本或 Forge 服务。使用 `--no-metrics` 安装依赖，未运行 Android Agent 初始化命令。
- Gradle Wrapper JAR SHA256 为 81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f；distribution 8.13 的 SHA256 与官方发布一致。AGP 8.13.2、Gradle 8.13 和 Java 21 实际运行，SDK XML 4 与旧 AGP 读取器存在非阻断兼容警告。
- 首次 Android 构建成功，35 个任务实际执行，APK v2 签名验证通过。随后复用 Forge 原图标增量打包，最终安装包及 SHA256 见 mobile/dist；这不等于 Android 真机或鸿蒙安装验收。
- 网页相关回归共 28 项通过：原生协议 7、剪贴板 7、分享 2、卡片弹框 12。配置安全测试 3 项通过；纯 Java 来源与工作台边界 19 个案例通过。Android Java 源码额外经 java-parser 语法解析，最终以 SDK 编译为准。
- 类型检查、菜单目录与模块边界检查通过，隔离 Vite 构建通过；保留既有分块大小和混合导入警告。OpenSpec strict 与 diff 检查通过。项目门禁 JSON PASSED、退出 0，仅 API-RUNTIME-001 实际执行，executedCheckers 为空，不能代替原生验收。
- 业务全景图原位更新并由 draw.io Desktop 31.5.3 导出同源 PNG，已实际查看，原生节点／引用结构解析通过；未另行执行图形交互编辑验收。
- 鸿蒙 SDK／Hvigor／设备签名仍未提供，HAP 尚未生成；Android 与 Mate 60 真机安装、权限、键盘、图片复制及社交应用分享仍未执行。没有擅自重启服务或隧道。
- 最终 Android 内测包约 2.39MB，`aapt2` 核对包名 com.exceptioncoder.forge.mobile、版本 0.1.0／1、min SDK 26、target SDK 36 及 MainActivity；复用原 Forge 图标后增量构建成功，8 个任务实际执行／27 个复用，apksigner 再次通过。SHA256：b56d2781193418dd0b0665e8d09e050ed8a60b91c3e351966262a0d3fc4be038。
- 最终配置安全测试为 5 项：补查了现有 DevEco 签名文件不被覆盖、私有 JSON 格式错误不输出原内容。末次类型检查通过。鸿蒙 build 复核仍退出 1 并明确缺 SDK，未伪造或交付 unsigned HAP。

## 队列复核与线上版本

- 2026-11-08 10:38:28 至 10:40:17（北京时间）复核既有自动发布：前端版本 `64c36f5d448d7e141b5e959e` 对应源码提交 `86a73e16ff0e08a598c3a73bfea6235038f49e03`，公网工作台两次 HTTP 200、版本一致；原生桥接脚本 HTTP 200 且包含协议回执事件。前端日志确认发布成功，服务进程保持运行。
- 观察超过 60 秒，backend／frontend／studio 的 PID 分别保持 21492／157436／121428，均 online、ready，重启次数保持 0。本次没有触发服务重启；该证据只证明网页版本发布与服务稳定，不代表原生设备验收。
- doctor 再次确认 Android SDK／Wrapper 可用，鸿蒙 SDK／Hvigor／私有签名均未配置；未重复构建 Android。华为官方下载入口需要账号登录，仍需本机提供 DevEco／SDK 路径及包含 Mate 60 的设备调试签名。Android APK 不代替鸿蒙 HAP，双端任务保持未完成。
