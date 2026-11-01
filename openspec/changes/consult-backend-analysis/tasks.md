# 实施任务

初始 HEAD 908a42316，tracked 工作区干净，保留已有未跟踪缓存。Graphify 查询因图超过 512MiB 上限失败，复用定向源码事实。L3，新增应用身份与企业隔离。

- [x] 1.1 完成应用授权、短期认证和异步分析 API，验证隔离、幂等、取消及恢复。
- [x] 1.2 完成结构化分析、受控证据读取及输出校验，验证无工具、无凭据泄漏和无伪造引用。
- [x] 1.3 完成 SDK 后端客户端、合同及可运行脱敏示例，并通过 SDK、宿主编译、定向测试和项目质量门禁。
- [ ] 1.4 [MANUAL_CONFIRMATION] 用户明确确认重启后核对目标版本并用真实测试问题、多应用/企业完成运行验收及稳定观察；正式地址和服务凭据通过安全渠道交付。

## 验证记录

- 宿主 reactor 编译、6 个定向测试类共 34 项通过，0 failure/error/skipped；覆盖新 API、原用户 WSS、受管取消与原一次性能力兼容。最终仅参数空项防护与安全错误日志有更新，fore-consult 的 13 项整组再验通过，不重复计算独立用例数。
- SDK 0.2.0 构建和 14 项测试通过；tarball 在独立目录离线安装，通过公开 `/backend` 子路径导入与 TypeScript 严格检查；Node 后端示例语法通过。包 SHA256：77D731988447EC229AC58E4B4CC5A08B8DEB5CE8551A5654AEFAAA685D506457。
- OpenSpec strict、OpenAPI YAML 解析及 33 个本地引用解析通过；并未运行独立的完整 OpenAPI 标准验证器。真实 HTTP 合同以 MockMvc 的成功/拒绝/恢复验证为证据，不声称公网已联调。
- 项目质量 CLI 最终 JSON 为 PASSED，退出码 0。executedCheckers 为空；9 项既有 tools/procurement HTTP 检查通过，仅证明原运行服务的这些接口，不代表本次分析 API 已加载。
- 新架构流程 Mermaid 使用仓库 Mermaid 解析通过。浏览器安全策略拒绝 file:// 本地预览，未绕过；视觉渲染未验收，忽略目录下预览 HTML 不作为已验收交付物。
- prepare_sql_context 为 PARTIAL：CONSULT_SERVICE_CLIENT、CONSULT_SERVICE_TOKEN、CONSULT_ANALYSIS_TASK 三张新表未命中 DDL 基线；仅应用启动 IF NOT EXISTS schema，无人工待执行 SQL。
- 未重启、未推送、未发布 npm、未创建实际应用凭据；未修改 yoooni-agent 工程。候选生成、人工编辑保存和飞书确认发送属于接入方，不能由 Forge mock 测试替代验收。开发运维改动不登记业务小纸条。
