# 原生 Harness Shell 环境引导

## 问题与范围

现有 windowsExecution.ts 只凭 process.platform 就宣称主 Shell 是 PowerShell 7，并注入多个原生引擎。Windows 上的 Claude、Codex 等可能选择不同 Shell，此断言缺少执行环境证据。

本次修正错误断言：明确宿主 OS 与执行 Shell 的区别，旧 PowerShell 注意事项只在原生工具实际使用 PowerShell 时适用。新增引导通过现有 SessionManager → developerInstructions → EngineAdapter 通道提供，不新增执行工具或模型调用。

适用原则：AI-01 复用原生能力，EVID-01 区分事实与未知，CTRL-01 不因错误改变环境；无例外。不涉及 UI 或权限扩展。

## 证据与边界

- 已知：Sidecar 宿主 OS、会话 cwd、引擎身份。
- 未知：现有统一协议没有权威的原生 Shell 类型/版本或当前工具清单字段。不得用 SHELL、COMSPEC、where/which 结果或另起 PowerShell 进程冒充该证据。
- 模型优先使用 Harness 自带环境上下文与工具定义；缺失时仅在有原生环境检查能力时确认一次，否则保留未知。此实现不是确定性的 Shell 版本探测器。
- 失败结果完全由原生 Harness 提供。一次简短提醒是提示词行为约束，不是 Forge 回写工具结果、插入恢复轮次或保证恰好一次的状态机。
- restricted/demo 会话不注入新增执行引导；不会借环境检查扩充工具或放宽权限。
- 每轮通过现有上下文配置传入规则，支持原生恢复后的上下文；不追加用户消息，不为每次工具调用追加推理。

## 实验与保留条件

新增规则只在 Sidecar 环境 `FORGE_SHELL_GUIDANCE_EXPERIMENT=1` 时启用，默认关闭。修正错误的 PowerShell 7 断言不依赖实验开关。不开新 UI 菜单，不修改用户 Harness 配置。服务环境变更遵守当次重启授权规则。

同一模型、版本、推理档位、原生 Shell、权限与干净临时项目分别运行关闭/开启引导两组；交替顺序，每个任务每组至少 5 次。任务组覆盖：含中文及空格目录检索、多文件名筛选、Maven 含逗号参数、Git 只读状态、预置失败测试诊断。使用相同任务文本、依赖与上下文，每次新建原生会话并保留脱敏事件。不得在真实项目执行破坏性任务。

记录首次 Shell 命令 exit code、明确 Shell 兼容错误、最终任务验收、工具调用数、总时长、原生 usage 输入/输出/缓存 Token。未报告 usage 标为缺失，不能记零；正确诊断预置失败测试不能算 Shell 方言错误。汇总首命令成功率、最终完成率、平均调用次数/时长/Token，另列 Shell 错误率及原始样本。

保留条件：Shell 错误率下降，最终完成率不下降，平均工具调用、时长与 Token 均不比基线增加超过 10%；样本不足、无错误可比较或数据缺失则保持实验关闭。10% 为初始效率阈值，不宣称统计显著性。未通过时关闭实验，不改变原生执行器。
