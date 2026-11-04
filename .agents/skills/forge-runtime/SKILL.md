---
name: forge-runtime
description: "Forge/kai-toolbox 首次环境准备、启动、停止、重启、状态日志和运行故障诊断。复用 node forge.mjs；普通编码与文档修改不触发起停。"
---

# Forge 运行技能

本文件是首次启动、日常运行与故障诊断的唯一流程正文。授权及交付边界读取根目录 [AGENTS.md](../../../AGENTS.md)，配置、模式与命令细节查 [scripts/STARTUP.md](../../../scripts/STARTUP.md)。不复制授权例外，也不创建新运行器。

唯一运行控制入口为 `node forge.mjs`。不使用强杀端口、临时起停脚本或原始 Maven/npm/java 命令替代受管运行控制。仅询问流程时不启动服务。

按需阅读：首次拉取或“跑起来”从首次启动开始；日常起停使用日常运行；异常先查故障诊断；实际启动或重启后完成共同验收。

## 首次启动

### 确认环境与已有实例

- 定位含 `forge.mjs` 的项目根目录，所有后续命令在该目录执行。记录 `git status --short`、`git rev-parse HEAD`；不自动 pull、stash 或覆盖改动。
- 识别实际操作系统、Shell 和工具路径，不从 Windows 推断一定是 PowerShell。使用当前 Harness 原生执行工具和实际 Shell 语法。
- 基础要求：Node.js 22.13+、JDK 21、Maven 3.9+、Git。先确认 Node 可执行，再运行 `node forge.mjs doctor`；缺失时报告具体工具和版本缺口，优先复用已有安装及工具路径配置，不擅自升级全局环境。
- `doctor` 只检查 Node/npm/Java/Maven/Git；Python、模型和其他可选服务需按实际启用项检查。首次执行非 help 命令可能安装锁定的运行时 npm 依赖，需要网络。
- 运行 `node forge.mjs status`，记录当前模式、服务范围、实际端口和进程身份。已有健康实例则复用并给出地址；不能把它宣称为本次源码版本。异常或不同模式先诊断，不能靠 stop/start 或重载绕过重启确认。

### 选择最小启动范围

用户要求启动且尚无运行实例时，默认沿用本机配置执行：

```shell
node forge.mjs start
```

它会准备依赖、编译并等待启用的主服务 HTTP 就绪，不必先手动执行一轮 npm/Maven 构建。只准备依赖而不启动时用 `node forge.mjs prepare`。用户明确只需要某一端时用 `start --scope backend` 或 `start --scope frontend`，交付只覆盖该范围。

- 保留当前运行模式；后端 `dev/full` 与前端 `dev/static` 是独立选项。静态前端只发布已提交快照，工作树修改不等于页面已更新；用 `node forge.mjs frontend status` 核对实际产物。
- 工具路径、端口等按 `scripts/STARTUP.md` 配置：非空进程环境优先于 `scripts/run-tools.d/*.conf`，再回退旧 `scripts/run-tools.conf`。只检查需要的键，不输出整份私有配置或凭据。参考 `scripts/run-tools.example.d/`，不复制其他同事的路径、证书或数据库。
- Docker、Task、Whisper、Studio、Cloudflare 均不作为默认必需条件；不自动开启隧道、安装证书或修改防火墙。已启用的服务如有缺失，明确报告，不静默关闭来制造成功。
- HTTPS 缺少证书时按启动说明处理，不静默降级 HTTP；Node 命令跨平台不等于各平台已实机验收。
- 启动请求不授权切换已有实例模式、启用 hot reload 或全天自动重启。确需重启时，先说明目标、原因与影响，遵守本次明确确认边界。

## 日常运行

先按 `AGENTS.md` 核实本次操作授权；仅查询状态、日志不执行起停。所有命令在项目根目录运行。

| 目的 | 命令 |
|---|---|
| 状态 / 日志 | `node forge.mjs status` / `node forge.mjs logs backend`（或对应服务） |
| 完整停止 | `node forge.mjs stop` |
| 完整重启 | `node forge.mjs restart` |
| 后端重启 | `node forge.mjs restart --scope backend` |
| 前端重启 | `node forge.mjs restart --scope frontend` |

定向重启保留其他服务；后端重启所需本机 Token 按启动说明配置，不输出凭据。保留前端 dev/static 模式，用 `node forge.mjs frontend status` 核对静态产物。修复后再次重启仍按 AGENTS.md 取得本次授权，不能用停止后启动绕过。

## 故障诊断

默认等待最多 600 秒。首次下载较慢时持续读取工具执行结果，不重复启动。超时或 Ctrl+C 只结束等待，后台服务可能仍在运行：先 `status` 和 `logs backend`（或对应服务），再决定是否用相同 `start` 继续等待。不要并行拉起第二套进程。

需要延长等待时，仅调整当前执行环境，结束后恢复原值。PowerShell 示例：

```powershell
$forgePreviousTimeout = $env:FORGE_START_TIMEOUT_SECONDS
try {
  $env:FORGE_START_TIMEOUT_SECONDS = '900'
  node forge.mjs start
} finally {
  $env:FORGE_START_TIMEOUT_SECONDS = $forgePreviousTimeout
}
```

依错误输出定位：依赖下载失败查网络/包源，编译失败查构建日志，端口冲突查受管状态与归属。未知监听者不得强杀；需要处理时报告归属和阻塞。已有进程修复后需要重启，仍须取得当次确认，不重复相同失败命令、不自建恢复循环。

## 启动与重启验收

1. 用 `node forge.mjs status`、`node forge.mjs logs backend`（或本次启用的服务）核对本次启动、实际端口、进程身份及致命异常。后端就绪不证明 Sidecar 和所有引擎都可用。
2. 使用实际地址做只读 HTTP 验证：前端首页、后端 `/api/tools` 的状态与有效 JSON，以及本次所需功能冒烟。不要固定请求旧文档的 8080 或别的实例。已启用固定域名隧道还需验证公网首页/API 回源。
3. 本次实际启动/重启后至少观察 60 秒，起止复查身份、重启次数和 HTTP；变化或失败需诊断并重新计时。页面未打开、真实引擎请求未做时分别标为未验证。
4. 汇报工作区/源码版本、运行模式及范围、访问地址、日志/HTTP/稳定观察结果和剩余缺口。失败保留证据及下一步，不把 exit 0、PM2 online 或端口开放单独当作成功。仅使用技能/启动服务不要求产生代码提交；如修复代码则遵循仓库交付规则。
