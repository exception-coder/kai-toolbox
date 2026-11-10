## Context

基线 HEAD efbf8dab，已有其他任务工作区改动不纳入提交。ForgeEnvironmentService.inspect 串行组合分组；ForgeEnvironmentCommandRunner 每次读取 Windows PATH 并包装 cmd；ForgeEnvironmentPage 首次等待整份结果。宿主已运行，实际端口与模式以 forge.mjs status 和运行设置为准。

## Goals / Non-Goals

目标：同一 HTTP 入口切换本机命令执行实现，降低串行等待，提供真实可比耗时和失败恢复。非目标：迁移安装、公司套件规则、仓库同步或整个 Spring 平台；不宣称整页已迁移 Go。

## Decisions

### 探测契约和边界

EnvironmentProbeEngine 返回固定 11 项版本命令结果，Java/Go 均限制最多 4 条并行、每条 10 秒、有界输出。Go 标准库独立模块，通过固定二进制的 JSON stdout 协议 v1 调用；不接收浏览器提供的命令、工作目录或二进制路径。二进制位置由服务端配置，缺失或协议错误明确失败。Java 接口负责输入适配，共享工具规则负责版本和阻断判定，基础设施适配器负责进程与协议。未来可在同一端口增添远程适配器，无需更改 UI。

### 性能与公平性

Java 并发执行命令，两引擎采用相同 PATH 快照和命令集合。环境聚合将探测与共享套件/仓库检查并发调度，但同一次请求的共享仓库操作保持顺序，避免 fetch 冲突。前端 query key 包含引擎，短期保留已有结果；显式检测和对比重新执行命令、不使用结果缓存。对比顺序执行两个引擎，显示各自时间戳、整体耗时、探测耗时、逐项耗时与状态差异；提示操作系统缓存和共享检查仍影响结果，不将单次结果表述为语言基准。PATH 解析缓存 60 秒，显式刷新和安装复检强制更新。

### 状态和恢复

保留 READY/MISSING/INCOMPATIBLE/ATTENTION 契约，命令超时或非零退出为 ATTENTION 并带原因，真正无法找到命令才为 MISSING。阻断项 ATTENTION 仍阻断初始化。引擎级失败不返回伪造健康快照。选择器在加载和错误时仍可用，允许切回 Java；安装期间禁用切换/对比，防止操作完成事件污染其他引擎缓存。

### UI

CONSERVATIVE 模式，复用现有 Button、排版、分割线和原依赖列表。新增紧凑引擎选择与对比表，不新增卡片层级。原有业务源码检查和安装入口保留。

## Risks / Trade-offs

- 子进程启动、杀毒软件和磁盘缓存会影响计时 → 单独记录引擎与完整请求耗时，明确共享范围。
- Windows shim 子进程可能遗留 → 超时终止进程树并限制读流等待；测试实际超时和输出上限。
- 两套命令列表可能漂移 → 契约测试比对固定 ID 集合和版本结果；共享判定逻辑不复制。
- Go SDK 当前不可用 → 使用官方发行包校验 SHA256 后在本机缓存构建，交付构建脚本，制品不提交。

## Migration Plan

先完成引擎测试、Go 测试和构建，随后接入 UI 和宿主；执行前端测试/build、宿主打包、Forge 全量门禁、真实 HTTP/浏览器对比和至少 60 秒稳定观察。默认仍为 Java，回滚时切 Java 即可；Go 二进制不影响 Java 服务启动。安装、源码同步后清理相关前端结果并重新检测。

## Open Questions

无阻塞选择。真实加速比例待本机实测，不能以串行理论上限代替测量。

## Evidence

Agent 自审：共享规则可防止结果漂移，stdio 比新增常驻服务更符合本地单用户部署，未引入新权限边界或数据库。参考 [Go os/exec](https://pkg.go.dev/os/exec)、[Java ProcessHandle](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ProcessHandle.html) 的超时与进程控制契约。
