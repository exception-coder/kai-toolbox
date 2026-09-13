# Environment Probe

Forge 环境管理的独立 Go 命令探测模块。当前切换的是 Git、Node、npm、Python、uv、Claude、Codex、Graphify、OpenSpec、Java、Maven 的版本命令执行；版本判定、公司套件、仓库检查及安装继续共用 Java。这里不是整页后端的 Go 重写。

## 构建与使用

需要 Go 1.24+、Node.js 22+。在仓库根运行：

```shell
node scripts/build-environment-go.mjs
```

脚本先执行 `go test ./...`、`go vet ./...`，再构建并安装到 `~/.kai-toolbox/bin/environment-probe`（Windows 为 `.exe`）。可设置 `GO_CMD` 指向已安装的 Go 可执行文件；Windows 也识别本机 `LOCALAPPDATA/kai-toolbox/toolchains/go/bin` 缓存。脚本不自动下载 SDK，官方安装入口为 [go.dev/dl](https://go.dev/dl/)。构建制品不进入 Git。

默认 Java 无需 Go SDK 或二进制。Go 二进制只在检测请求中按需运行，不监听端口；部署到其他主机时应构建对应平台制品。Spring 配置 `toolbox.environment.go-binary`（环境变量 `TOOLBOX_ENVIRONMENT_GO_BINARY`）可指定服务端二进制绝对路径。源码修改后重新运行构建脚本，已有 Java 服务无需重启即可使用新 Go 制品。

在“项目库 → 环境管理”选择 Java 或 Go。点击“对比两种实现”会按 Java、Go 顺序重新检测，展示整体、命令批次及逐命令耗时和结果差异。两轮不使用结果缓存、不执行远端 fetch；操作系统缓存、外部工具启动以及公共仓库检查会影响计时，单次结果不是语言性能基准。

## 契约与迁移边界

既有 HTTP 入口 `/api/claude-chat/forge-environment` 新增 `engine=java|go`（默认 java）和 `refresh=true|false`（默认 false）。`refresh=true` 强制刷新 PATH，`fetch=true` 保留既有远端检查行为；HTTP 请求始终执行新命令检测。前端普通浏览保留 60 秒 query 数据，query key 按引擎隔离。

Java 的 `EnvironmentProbeEngine` 是实现切换端口。Go 仅输出协议 v1 JSON，包含 `engine` 和 11 个 `results`；每项包含 `id`、`exitCode`、`completed`、`output`、`durationMs`。Go 不接收任意命令参数。适配器校验版本、引擎、完整 ID 集合、输出上限和计时字段，缺失制品或协议不匹配返回可恢复错误，不静默降级。

两引擎使用相同 PATH 快照，最多同时运行 4 条命令，每条 10 秒超时，输出最多 16000 字符（Go 为更严格的 16000 字节）。Go 批次调用额外限制 45 秒和 256000 字符输出。超时清理子进程树；不存在的命令退出码为 127，超时或启动异常为 -1，真实命令失败保留退出码。公共规则将检测异常显示为 ATTENTION，真正缺失为 MISSING。

未来迁移其他能力时，在其业务边界定义端口与一致性测试，再提供 Go 适配器；不将这里扩展成通用任意命令执行服务。

## 验证

```shell
cd go/environment-probe
go test ./...
go vet ./...
```

测试覆盖并发上限、固定顺序、缺失命令、超时和有界输出。Java 测试覆盖协议拒绝、共用判定和执行器；前端测试覆盖切换期间旧请求返回、失败恢复、顺序对比和安装互斥。真实页面和服务验收记录见 [OpenSpec tasks](../../openspec/changes/add-switchable-environment-probes/tasks.md)。
