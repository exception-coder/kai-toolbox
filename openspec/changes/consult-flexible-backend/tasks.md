# 实施与验证

- [x] 1.1 新版默认合同、业务资料与可变回复；保留凭据、旧任务和幂等。
- [x] 1.2 SDK 0.4.0、合同 1.5.0、示例和架构说明同步。
- [x] 1.3 后端集成、SDK、模块构建、OpenSpec 及项目门禁验证并提交。
- [ ] 2.1 [MANUAL_CONFIRMATION] 确认目标实例与本次服务重启，加载后核对认证、新版真实任务、旧任务和至少 60 秒稳定观察。

验证记录：2026-11-05，24 项后端集成测试（模型替身）、18 项 SDK 测试及咨询模块 Maven package 通过；OpenSpec strict、OpenAPI YAML、Markdown 围栏及 git diff 检查通过。项目门禁 JSON PASSED/退出0，executedCheckers 为空，仅执行既有 toolbox-api-tools HTTP 200 探测，不代表新版服务或真实模型验收。未重启、未部署、未推送；目标域名的真实加载仍待完成。SDK tarball 位于 outputs/forge-consult-client/kai-forge-consult-client-0.4.0.tgz。

## 2026-11-24 ITCS 分析上下文使用修正

- [x] 补充外部分析入口的上下文使用规则，处理明确的最新纠正、已尝试操作及资料适用条件，证据不足时避免罗列通用原因。
- [x] 扩展既有业务资料集成用例，检查完整问题与证据进入异步和即时入口的同一无工具模型调用。
- [x] 咨询模块及依赖定向 package 退出 0，ConsultBackendIntegrationTest 32 项、ConsultPlainWritingSkillTest 2 项通过，无失败或跳过。模型替身验证同步/异步载荷、纠正资料和证据完整传入，以及模式、隔离、取消和非法输出合同。
- [ ] 目标实例加载后以 ITCS 真实失败请求、原始响应和业务认可答案回放验收。当前缺少失败样例，尚未验证实际回答改善。

本次采用 L1 局部提示词修正，保持接口和上下文权限边界，无架构影响。OpenSpec strict 与 diff 检查通过。质量门禁使用 CLI verify all，JSON PASSED、退出 0，executedCheckers 为空，仅执行 API-RUNTIME-001 的既有服务 HTTP 200 探测。未重启、未部署、未执行真实模型或 ITCS 回放，不将规则装配测试记为回答效果验收。
