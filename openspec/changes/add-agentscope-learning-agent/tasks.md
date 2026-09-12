# 实施任务

## 1. 集成

- [x] 1.1 清理独立示例，登记现有 Agent 注册表及纠正记录。
- [x] 1.2 实现配置版本、订单契约、模拟工具及 AgentScope 适配。
- [x] 1.3 实现运行记录与回归评测，复用权限及网关。
- [x] 1.4 在现有 Agent 详情实现六块内容和试运行。

## 2. 验证交付

- [x] 2.1 完成 Java、SQLite、前端及浏览器验证。
- [x] 2.2 更新教学说明、索引和工作日志，执行门禁并提交。

## 验证证据

- Java 21：`mvn -pl tools/tool-fore-consult -am test` 成功；补充工具结果记录后单独重跑 `AgentScopeTeachingExecutorTest` 成功。
- 前端：typecheck、build、教学详情 2 个 Vitest 测试通过；构建保留既有大块体积警告。
- 浏览器：真实 AgentManagementPage + 独立 Spring / 内存 SQLite，试运行、版本保存、100% / 60% 回归差异、错误恢复通过，1440 / 375 无横向溢出及页面异常。
- Forge CLI：exit 0，status PASSED；执行 9 个既有 API runtime 校验，executedCheckers 为空，未执行静态 checker。本功能由上述专项测试独立验证。
- OpenSpec strict 通过；真实模型供应商未调用，需配置网关后验证解析质量。
