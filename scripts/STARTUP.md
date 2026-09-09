# Forge 启动与运行

## 日常只用一个入口

安装 Node.js 22+、JDK 21、Maven 3.9+ 和 Git 后，在项目根目录运行：

```shell
node forge.mjs start
node forge.mjs status
node forge.mjs restart
node forge.mjs stop
```

这是源码启动：自动准备依赖、构建 Agent Sidecar、编译 Maven 模块，再运行 Spring Boot 与 Vite。首次启动需要联网下载依赖。start 会显示准备、编译及就绪进度，只有启用的前后端响应 HTTP 后才显示“主服务启动成功”并给出访问地址；辅助服务未就绪或失败单独列出。重复 start 会检查现有服务，不重复启动。

默认最多等待 600 秒，通过 FORGE_START_TIMEOUT_SECONDS 可设为 1–3600 秒。启动失败或等待超时返回非零码并给出诊断命令，后台进程保留；再次 start 可继续等待。Ctrl+C 只结束等待，关闭终端后服务继续运行，停止请执行 stop。HTTP 就绪不等于所有业务功能验证通过。

不要求 PowerShell、Bash、Task 或 Docker。已安装 Task 的团队可以使用等价的 `task start / status / restart / stop / logs`。

## 常用选项

| 用途 | 命令 |
| --- | --- |
| 环境检查 | `node forge.mjs doctor` |
| 提前安装服务依赖 | `node forge.mjs prepare` |
| 只启动前端 | `node forge.mjs start --scope frontend` |
| 只启动后端及辅助服务 | `node forge.mjs start --scope backend` |
| 停止一侧，保留另一侧 | `node forge.mjs stop --scope frontend` 或 `--scope backend` |
| 查看后端最近日志 | `node forge.mjs logs backend` |
| 查看控制器最近日志 | `node forge.mjs logs` |
| 源码打包后运行 JAR | `node forge.mjs start --mode full` |
| Java 源码变化后自动完整重启 | `node forge.mjs start --hot-reload` |

改变启动 scope 或 mode 前先 stop。已有运行实例的重复 start 不重复启动、不抢占端口。热重载采用完整进程重启，默认关闭；Vite 自身继续负责前端热更新。开发启动跳过 Maven 测试，发布校验仍使用项目质量门禁。

前台断点调试仍可使用 `task prepare` 后 `task dev`，或分终端 `task dev:backend / task dev:frontend`。这些前台调试任务关闭自动更新，不受后台守护管理。发布制品沿用 `task build / task run`；full 模式仍是本地源码构建，不是 Docker。

## 独立启动测量

日常 `node forge.mjs start` 已自动采集后端启动阶段。需要保存一次隔离实验时使用同一个 CLI：

```shell
node forge.mjs measure-startup
node forge.mjs measure-startup --port 18090 --skip-build
node forge.mjs measure-startup --timeout-seconds 180 --target-path /api/tools
```

该命令默认先执行 Maven package，然后在独立端口和数据目录运行临时后端，保存 report.json、runtime.json 及日志；成功、失败、超时或 Ctrl+C 后清理自有进程。它不启动 PM2，也不停止日常服务。默认就绪超时 120 秒，可设为 5–600 秒；该超时不包含 Maven 构建。目标 GET 不跟随重定向，不接受查询字符串，只应选择无副作用的接口；需要身份验证的接口可能返回失败。

`--skip-build` 使用已有 JAR 并明确标记构建未测量；`--application-jar PATH` 指定 JAR，`--output-root PATH` 指定报告父目录，默认 `outputs/startup-performance/<运行标识>/`。页面可导入 report.json。临时运行关闭与旧测量工具相同的可选集成，不代表完整辅助服务启动基线。旧 `scripts/measure-startup.ps1` 仅转发参数至此命令，不再包含测量实现。

## 地址与配置

工作台通常为 `https://localhost:5173`，API 为 `http://localhost:18080`，控制器只监听 `http://127.0.0.1:18081`。保留 Vite 项目自身的 TLS 配置。

继续读取 `scripts/run-tools.d/*.conf` 和 `scripts/run-tools.conf`，纯文本 KEY=VALUE，不执行脚本。优先级：非空进程环境变量 → 按文件名排序的分类配置 → 旧单文件。分类配置无需迁移；可以继续使用旧单文件，不再要求运行配置迁移脚本。

```properties
# 本机工具可执行文件或安装目录；留空从 PATH 查找
JAVA_CMD=
MVN_CMD=
NPM_CMD=
PYTHON_CMD=

# 辅助服务按需启用
FORGE_VISITOR_ANALYSIS_ENABLED=true
FORGE_WECHAT_ENABLED=false
FORGE_STUDIO_ENABLED=false
TOOLBOX_WHISPER_MODE=cli

# 页面重启令牌：自行填写随机值，留空禁用对应外部接口
TOOLBOX_SYSTEM_RESTART_TOKEN=
TOOLBOX_SUPERVISOR_RESTART_TOKEN=
TOOLBOX_AUTO_UPDATE_ENABLED=true
```

工具路径含空格和中文可直接填写，无需 shell 引号。Maven 使用实际安装目录的 Java 入口，不执行 mvn.cmd；额外 Maven JVM 选项使用 `FORGE_MAVEN_JVM_ARGS` JSON 字符串数组。配置中凭据只进入进程环境，状态接口不返回原始环境。`TOOLBOX_SQLITE_FILE`、`ARIA2_BIN` 和 Qdrant 旧配置继续适用。

## 重启与自动更新

PM2 是独立进程所有者。控制器保留 `/status`、`/restart`、`/reload`、`/full-reload` 协议 v1，页面仍通过 Vite `/supervisor` 代理访问。`/restart` 重启后端及启用的辅助服务；`/full-reload` 重启整个运行栈，并从磁盘读取新的控制器代码和配置。并发重启请求返回 409。

Java 继续负责 Git 检查、空闲判断、候选构建和更新；控制层不增加第二套自动更新。工作树 dirty、分支分叉或会话忙碌时仍延期，不执行 stash/reset/clean。实际更新进度看 `/api/system/auto-update/status`。自动生成的内部控制令牌保存在 PM2 进程环境，不打印、不保存 PM2 dump。运行目录位于当前用户 `~/.kai-toolbox/runtime/<仓库标识>/`，日志也在此处。

源码辅助服务、控制器或前端崩溃由 PM2 重试；连续快速失败最多 5 次，状态显示 errored，修复后 restart。ready 表示受管进程已监听端口，不代表所有业务接口都已验证。Java Agent Sidecar 仍由 Java 管理，PM2 只对所属进程树做退出兜底。

独立 IDE/JAR 运行不会再启动 PowerShell 抢占自身端口。独立 JAR 更新接管使用 Java 原生 ProcessBuilder 和参数文件，保留原握手、候选失败保留当前服务与取消流程。

## 辅助服务与观测

| 服务 | 开关与行为 |
| --- | --- |
| 访客分析 | 默认启用，`FORGE_VISITOR_ANALYSIS_ENABLED=false` 关闭，端口 9600 |
| faster-whisper | `TOOLBOX_WHISPER_MODE=asr-service` 启用，端口 9500；macOS 默认 CPU/int8，其余平台可配置 WHISPER_DEVICE |
| 微信 | Windows 默认启用，可显式关闭，端口 9700；依赖已登录的桌面微信，其他平台不能启用 |
| AgentScope Studio | `FORGE_STUDIO_ENABLED=true` 启用，端口 3000；使用仓库锁定的本地 npm 包，不自动全局安装 |
| Phoenix / Langfuse | 可选外部观测设施，独立 Compose；源码进程不装进容器 |

Python 服务使用自己的 `.venv`；首次或 requirements 变化时安装依赖。每个服务独立日志、独立重试，不阻塞前后端。启用的第三方包仍可能需要 GPU、编译工具或模型下载；错误查对应服务日志。

Phoenix Compose 沿用 `task deps:check / deps:up / deps:status / deps:logs / deps:down`，需要显式设置测试过的 `FORGE_PHOENIX_IMAGE` 标签或摘要。默认回环端口 16006，独立数据卷。启动 Forge 时可加 `--observability phoenix` 自动设置 OTLP 地址；这个选项只配置连接，不启动 Docker。复用旧 Phoenix 时设置 `FORGE_PHOENIX_PORT=6006`。Langfuse 填写 LANGFUSE_BASE_URL/PUBLIC_KEY/SECRET_KEY 并使用 `--observability langfuse`；`--observability off` 关闭导出。默认 external 保留显式环境配置。

## 从旧监督器切换

1. 退出当前旧监督器终端及它管理的服务。新入口不会根据端口杀掉旧进程；端口冲突会明确报错。
2. 保留现有配置，执行 `node forge.mjs doctor`。
3. 执行 `node forge.mjs start`，用 status 和 logs 确认就绪。

旧平台启停快捷脚本、配置迁移脚本和 Phoenix 启停脚本已删除，请更新终端快捷方式为 `node forge.mjs`；Phoenix 使用 `task deps:up / deps:down`。现有本机配置和数据继续保留。旧 frontend/backend、Mode、HotReload 参数兼容；按端口强杀、KeepStudio 等旧清理参数已取消。需要单独保留服务应单独管理，不让多个运行器争夺同一端口。

Node/PM2 自身依赖升级时先 stop，再在 `scripts/runtime` 执行 `npm ci`，最后 start。业务源码 full-reload 不替换正在运行的 PM2 守护引擎。

## 平台与验证边界

代码统一面向 Windows、macOS、Ubuntu、受维护的 CentOS Stream，使用平台支持的 Node 22+ / JDK 21；不承诺 CentOS Linux 7/8。微信桌面自动化仍只支持 Windows。

Windows 真实隔离测试覆盖中文/空格目录、双实例、源码重载、控制器崩溃、令牌拒绝、重复启动、停止进程树、未知端口保护。Java 原生 replacement 及控制交接有自动测试。macOS/Ubuntu/CentOS 尚未进行实机验收；本次没有自动关闭当前旧服务或迁移用户正在运行的会话。

PM2 7 在 Windows 的固定管道名由隔离适配器按运行目录区分；其可选 WMI/PowerShell 资源统计关闭，因此不提供 Windows CPU/内存图表，也不依赖 PowerShell 版本。日常生命周期不安装开机服务。
