# 研究优先预设任务

- [x] 核查项目注入点、原生工具能力与官方实践。
- [x] 添加默认 research-first，与 environment-default 统一交接；保持受限和专用任务边界。
- [x] 同步架构正文、流程及旧实验状态说明。
- [x] Sidecar 完整 TypeScript 编译到 `.test-dist-research-first`，未覆盖运行 dist；48 项定向回归通过。
- [x] 项目门禁 exit 0、JSON PASSED；9 个已有 API 检查通过，静态 checker 列表为空，不代表预设行为运行验收。
- [x] 使用项目 Mermaid 解析器检查更新流程图语法；未执行图形渲染验收。
- [ ] 获授权后加载目标服务版本，验证技术选型、简单 Bug、离线三个真实 Harness 场景。

当前未重启、未更改运行配置，不声称线上已生效或模型行为已通过验收。
