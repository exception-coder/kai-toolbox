# 项目原生发布标准

状态：2026-11-09 规范与编写模板已落地；不是已上线的通用发布服务。适用于新接入或补齐发布能力的项目。既有项目先映射现有命令，不因目录不同重写运行器。

## 职责与采用方式

项目拥有构建、检查、部署、冒烟、日志、互斥和恢复的唯一实现；操作系统或既有进程管理器拥有任务生命周期。AI 发现入口、补齐缺口、在获授权后触发，并按需分析失败证据。Forge 集成只投影项目任务，不复制阶段逻辑、不另造发布调度引擎。

先读项目 `AGENTS.md`、`scripts/release/README.md`，再检查既有部署文档、package scripts、Make/Task、Shell/PowerShell 和受管服务入口。有等价能力时增加薄适配或说明，不并存两套发布流程。项目尚无入口时，使用[项目说明模板](../templates/project-native-release/README.template.md)编写；缺少目标、权限或验收条件时先完成独立可开发部分，发布保持未就绪，不写永远返回成功的占位脚本。

本标准不授予部署、重启、数据库写入或生产操作权限。规范编写、构建授权不等于发布授权。Forge 本仓继续只用 `node forge.mjs` 控制运行，适配不能绕过本仓重启确认规则。

## 目录与命名

新项目推荐以下结构；只创建实际使用的文件。

```text
AGENTS.md                          发布时读取 scripts/release/README.md
scripts/release/
  README.md                        本项目唯一发布说明：入口、环境、权限、验收及恢复
  release.ps1                      入口三选一：release.ps1 / release.sh / release.mjs
  lib/                             按需拆出的阶段实现，调用现有项目工具
  environments/test.example.json  脱敏配置示例；格式沿用项目约定
.release/                          默认本机运行目录，加入 .gitignore
  runs/<run-id>/status.json         原子更新的任务事实
  runs/<run-id>/events.jsonl        按序追加的阶段事件
  runs/<run-id>/logs/               阶段日志；不提交仓库
  artifacts/<artifact-id>/         不可变制品、清单和校验值
```

文件名使用小写 kebab-case，不使用 `deploy-final-v2`、临时时间戳脚本等命名。只选项目已具备的运行时，不为统一扩展名安装新语言。旧项目的 `deploy.sh`、`forge.mjs` 等路径可继续作为权威入口，在 README 写明命令映射；不得创建第二个起停通道。

运行目录可以放在既有持久目录或制品仓库，必须与源码清理、发布目录切换和临时 worktree 生命周期分离，并在 README 声明实际位置、访问权限和保留期。制品 ID 不等于 Git 分支名。配置文件只保存环境别名、非敏感目标及凭据引用；密钥来自现有资源中心、操作系统凭据或受控环境变量，不放入命令行、Git、状态及日志。

## 命令契约

统一动词和语义；参数拼写遵从实际 Shell。下面的 `--env` 在 PowerShell 中可映射为 `-Environment`，映射表必须写入项目说明。各入口提供 `help`/`--help`，不启动任务。

| 动词 | 必须行为 |
|---|---|
| `build` | 从明确源码快照生成不可变制品和清单；不部署 |
| `verify` | 复用项目质量入口，检查准确的源码/制品；保存实际执行项及结果，不把跳过视为通过 |
| `deploy` | 部署指定且校验通过的制品，并完成 `smoke`；不隐式重新构建 |
| `smoke` | 核验目标版本、服务、必要业务场景和项目规定的稳定观察；失败非零退出 |
| `status` | 按任务 ID 只读查询状态、阶段、日志位置和恢复建议；不触发重试 |
| `rollback` | 部署明确的历史制品并完成 `smoke`；不把 Git reset 当回滚 |
| `run` | 单条命令编排 build → verify → deploy → smoke；委托项目已有工具，不新增 DSL |

`run`、`deploy`、`rollback` 默认异步提交；底层 worker 可同步执行阶段，但必须由独立宿主托管。`run --artifact` 复用已有制品和适用验证证据，省略 build；输入、依赖、配置或环境改变使相关证据失效时，重新执行受影响检查。项目只有六个旧动词时，可将 `run` 映射到现有完整发布命令。

共同参数：`env`（显式白名单，无默认生产环境）、`ref`（解析并冻结为完整 commit）、`artifact`（制品 ID 或允许目录内路径）、`run-id`（查询/关联）、`request-id`（变更请求稳定 UUID）、`json`（机器输出）。`ref` 与 `artifact` 的互斥及适用范围在 help 中说明；拒绝未知参数，不透传任意 Shell 字符串。首次 run-id 由项目生成，相同 request-id 与相同规范化参数返回原任务；同一 request-id 不同参数必须拒绝。请求响应丢失时按 request-id 查找，不能换 ID 盲目重放。

示意命令（模板目标，不是本仓现成命令）：

```powershell
./scripts/release/release.ps1 run -Environment test -Ref <完整提交号> -RequestId <UUID> -Json
./scripts/release/release.ps1 status -RunId <任务ID> -Json
./scripts/release/release.ps1 deploy -Environment test -Artifact <制品ID> -RequestId <新操作UUID> -Json
./scripts/release/release.ps1 rollback -Environment test -Artifact <历史制品ID> -RequestId <新操作UUID> -Json
```

Unix 入口对应 `./scripts/release/release.sh run --env test --ref <commit> --request-id <uuid> --json`；Node 入口对应 `node scripts/release/release.mjs run ...`。不要求同时实现三份脚本。

## 异步执行与结果判定

提交时先持久化请求并取得独立宿主的接收证据，再返回 `{schemaVersion, runId, requestId, state, statusLocation}`。提交命令 exit 0 仅表示任务已可靠受理，绝不等于发布完成。宿主交接失败返回非零，保留失败记录；收到回执后 AI 可立即结束本轮，告知任务 ID、查询方式和“待验收”。没有可靠交接证据时不能承诺离线继续运行。

Linux 优先已有 systemd service/transient service，Windows 优先已有服务或计划任务。单纯 `&`、`Start-Job`、终端 session ID 或 Agent 工具后台会话不构成脱离 Agent 的证明。安装/注册宿主任务按目标机器原权限办理，不能悄悄提升权限。既有 PM2/CI 能承担任务时继续复用，不额外部署另一套平台。

worker 必须传播阶段真实退出码并保存终态。进程消失但没有终态、宿主重启或状态过期时标记 `UNKNOWN`，通过宿主状态和目标版本只读对账；不能仅凭超时自动认定失败、清锁或重复部署。状态文件使用同文件系统临时写入加原子替换，events 使用单调序号；查询不能读到半份 JSON。宿主异常退出、持久化失败也须可从宿主日志定位。

| state | 含义 |
|---|---|
| `ACCEPTED` / `RUNNING` | 已受理 / 正在执行，均非成功 |
| `SUCCEEDED` | 本次命令要求的全部阶段 exit 0；部署类包含目标版本 smoke 与稳定观察证据 |
| `FAILED` / `TIMED_OUT` | 明确失败 / 超时且已确认执行停止，保留阶段与原因 |
| `UNKNOWN` | 是否仍执行或目标是否已改变无法确认，阻止不安全重放 |

`status` exit 0 表示查询成功；任务成功必须再读取 `state`。worker exit 0 才表示命令完成，非零表示失败；建议参数错误 2、权限拒绝 3、环境占用 4、阶段失败 5、超时 6，既有退出码可保留并映射，不把 CLI 查询成功混同为 worker 成功。

状态最小结构见[状态示例](../templates/project-native-release/status.example.json)。必需：协议版本、项目身份、任务/请求 ID、操作、环境、源码/制品关联（未生成可为空）、状态、当前阶段、创建/更新时间、各阶段状态/退出码/证据、日志位置、宿主任务标识、失败原因及恢复结果。时间统一 ISO 8601 UTC；运行阶段 exitCode 为 null，未执行阶段显式 `PENDING` 或带原因的 `SKIPPED`。证据与日志路径相对本任务目录解析，拒绝越界路径；远程引用由项目鉴权接口返回，读取同样校验项目与环境访问权。输出 JSON 写 stdout，诊断写 stderr；清除控制字符、凭据和用户敏感数据。

## 制品、权限、并发与恢复

- 制品清单绑定 artifactId、完整 commit、构建配置/锁文件指纹、文件 SHA-256、构建工具版本及验证证据。同一制品禁止原位覆盖；部署前重新验证校验值和目标兼容性。重复部署不重新 build，不静默拉取分支最新代码；环境配置与制品分别记录指纹。
- 发布前与实际切换前核验操作主体对项目、环境、操作的权限。CLI 的 `--approved`、Agent 自报授权文字、项目仓库中的配置不能代替可信身份/机器访问控制；本地单用户可复用 OS ACL 与受控账号，远程复用现有 SSH/sudo/平台 RBAC。不新增权限数据库。回滚同样受控。
- 发布与回滚共用“项目身份 + 环境”互斥键，范围覆盖切换、smoke、稳定观察和失败恢复。多客户端必须在同一目标宿主争锁，不能各自在工作站锁文件后并发部署。优先系统文件锁/命名互斥量或既有服务机制；没有分布式需求就不引入 Redis。未确认旧 worker 退出且恢复结束前不得按锁年龄强行释放。
- 每阶段和整轮均有有限超时，记录实际配置。取消/超时只处理本任务拥有的进程树，不强杀共享服务或端口；子进程/远端操作无法确认退出时保持 UNKNOWN 和互斥，不自动重试。源码快照、运行器脚本及请求参数冻结，避免会话修改或清理工作树影响后台任务。
- 发布前记录 previousArtifact 与实际运行版本。默认失败保留现场、旧制品及日志；自动回滚仅在本次已授权策略允许且兼容条件满足时执行。恢复结果单列 `recovery`，原发布任务仍为 FAILED；回滚成功也不能把失败版本标成已发布。
- 数据库迁移、消息/外部写入等不保证随应用回滚，必须列明兼容窗口、备份与人工步骤；生产、破坏性变更及写库遵守项目原边界。自动恢复不得扩大本次授权。

## Forge 与 AI 的接入边界

Forge 从当前项目上下文发现可信入口，触发时使用参数数组和确定的工作目录；不执行未审阅仓库配置里的任意命令。保存项目身份与 runId，通过项目 status 读取事实，展示有界日志，复用现有通知通道。完成/失败事件按 runId 与事件序号幂等处理，重复或丢失通知均以 status 对账；没有通知通道时保留可查询结果，不额外建消息系统。

失败交接只包含版本、目标环境、失败阶段、退出码、脱敏日志片段、当前运行版本和恢复结果。AI 负责诊断与有界修复，重新部署仍遵守本次授权，不长期轮询占用会话，也不自动无限重试。任务停止、Agent 结束、发布终态、业务交付完成是不同事实。

**本次只落地规范、模板及项目规则入口。** Forge 尚未增加跨项目 release 任务 API、状态页面或通知适配；也未为所有项目生成发布脚本。Forge 已有本地受管运行及前端快照发布可作为适配基础，不能宣称其已经实现本标准全部命令。后续按实际项目逐个补齐并验收，无需先搭建通用平台。

## 项目接入验收

1. 从 help/README 可找到唯一入口、实际环境、权限及状态/日志位置；一条 `run` 完成测试环境发布与 smoke。
2. 提交后关闭 Agent/终端，任务仍能独立得到真实终态；宿主不可用时提交明确失败，不返回虚假受理。
3. 验证成功及构建失败、smoke 失败、超时/异常退出；日志能定位阶段，旧状态/旧健康响应不能冒充新版本通过。
4. 相同 request-id 重试不产生第二次部署；同环境并发部署/回滚被串行化或明确拒绝。
5. 同制品再部署不构建，校验值不匹配拒绝；无权限的 deploy/rollback 均被拒绝。
6. 回滚后核验历史版本和 smoke；迁移不兼容时明确阻止并保留现场。
7. 接入 Forge 时实际验证状态、日志及通知/只读对账；没有实现的集成项单列，不以规范存在标记通过。

## 官方依据

- [systemd-run](https://www.freedesktop.org/software/systemd/man/255/systemd-run.html)：由服务管理器托管 transient service，提交与等待完成是不同模式。实施时以目标 systemd 版本核实支持参数。
- [Start-ScheduledTask](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/start-scheduledtask?view=windowsserver2025-ps)：异步启动已注册任务；成功启动不等于任务业务验收成功。实际 Windows 版本与服务账号权限仍须验证。

命令契约、目录和状态字段是本项目采用的约定，不是上述工具自动提供的完整 CI/CD 能力。
