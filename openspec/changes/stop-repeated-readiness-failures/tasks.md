## 1. Local development

- [x] 1.1 接入工具结果，实现重复失败识别、回放去重、上下文隔离和暂态错误排除。
- [x] 1.2 实现阻塞状态持久化、清理续跑队列及旧调度状态复查，完成回归测试和宿主装配。
- [x] 1.3 同步架构说明并完成严格规格校验与适用质量检查。

## 2. Runtime handoff

- [ ] 2.1 [MANUAL_CONFIRMATION] 确认后端重启后加载本变更，验收原会话阻塞原因、恢复及后续推进；本地修复不代表原会话已恢复。

## Verification

- 2026-10-07：ReadinessFailureGuardTest 与 SessionAutopilotServiceTest 共 29 项通过，无失败或跳过；覆盖重复失败后成功收轮仍阻塞、回放、业务拒绝、恢复/任务修订隔离、暂态排除与旧调度。
- 受影响 Java 模块及 toolbox-starter 完整 reactor package 成功；后续仅调整测试和文档，生产源码未变。其他任务未提交内容位于质量框架、运行脚本及 Sidecar 依赖，与本次 Java 回归无依赖。
- OpenSpec strict validation 通过。Forge Quality JSON status=PASSED、exit=0；executedCheckers 为空，未声称静态检查器通过；实际执行 9 项既有 API 探测，均通过，探测对象为运行中的旧后端。
- 未重启；新版本真实运行与目标会话验收未执行。目标会话读取返回 403，未绕过访问控制；未证实引用错误对应的具体配置缺项。
