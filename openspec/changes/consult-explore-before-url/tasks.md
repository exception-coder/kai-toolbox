# 任务

- [x] 核实无 URL 时 source_context 仍执行图谱查询。
- [x] 修正共用咨询定位规则、经典版本顺序与源码工具描述。
- [x] 补充已发布流程与经典版本提示词回归断言。
- [x] Sidecar TypeScript 无输出类型检查通过（退出码 0）。
- [x] 使用本机 JDK 21 完成受影响模块及依赖编译，ConsultOrchestrationPipelineTest 与 ConsultWorkflowServiceTest 共 10 例通过；默认 Maven 的 JDK 8 无法编译 release 21，未改系统配置。
- [x] 项目质量门禁：JSON status=PASSED、退出码 0；executedCheckers 为空，9 个现有 API 场景通过，不代表新规则实际模型效果已验收。
- [ ] 用户确认重启后，用无 URL 截图问题验证实际探索与必要追问；不将规则装配测试当作模型效果验收。
