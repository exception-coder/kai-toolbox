# 实施与验证

- [x] 1.1 新版默认合同、业务资料与可变回复；保留凭据、旧任务和幂等。
- [x] 1.2 SDK 0.4.0、合同 1.5.0、示例和架构说明同步。
- [x] 1.3 后端集成、SDK、模块构建、OpenSpec 及项目门禁验证并提交。
- [ ] 2.1 [MANUAL_CONFIRMATION] 确认目标实例与本次服务重启，加载后核对认证、新版真实任务、旧任务和至少 60 秒稳定观察。

验证记录：2026-11-05，24 项后端集成测试（模型替身）、18 项 SDK 测试及咨询模块 Maven package 通过；OpenSpec strict、OpenAPI YAML、Markdown 围栏及 git diff 检查通过。项目门禁 JSON PASSED/退出0，executedCheckers 为空，仅执行既有 toolbox-api-tools HTTP 200 探测，不代表新版服务或真实模型验收。未重启、未部署、未推送；目标域名的真实加载仍待完成。SDK tarball 位于 outputs/forge-consult-client/kai-forge-consult-client-0.4.0.tgz。
