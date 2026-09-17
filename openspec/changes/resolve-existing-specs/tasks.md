## 1. Resolver

- [x] 1.1 Implement bounded spec index, evidence retrieval and Graphify association.
- [x] 1.2 Implement idempotent audited decisions, draft and readiness validation.

## 2. Adapters

- [x] 2.1 Register shared Forge tools in SDK and stdio; provide JSON CLI.
- [x] 2.2 Implement thin configurable write/commit hooks and workflow documentation.

## 3. Verification

- [x] 3.1 Run sidecar typecheck and focused resolver/MCP tests, including failures and stale/conflicting inputs.
- [x] 3.2 Run hook integration and plugin contract checks; validate OpenSpec.
- [x] 3.3 Run project Forge quality CLI and report actual static/runtime evidence.
- [ ] 3.4 After explicit service restart approval, verify running target version and observe stability. Keep pending until authorized.

## 验证证据与交付边界

- TypeScript 全 sidecar 隔离编译通过；resolver/真实 stdio MCP 专项 10 项通过，相邻工具权限/注册回归 10 项通过。
- Hook 全量首轮 237 项：235 通过、1 跳过、1 指标隔离失败。新增 guard 令只启用注释检查的 fixture 多记录一条；明确禁用该 fixture 中无关的新 guard 后，指标、新 Hook 与分发器 10 项全部通过，保留其余未变检查证据。未关闭产品 Hook 或放宽字段断言。
- 真实临时 Git 项目验证 Hook → Forge CLI：未确认阻断，确认 NO_SPEC_CHANGE 后放行。
- OpenSpec 严格校验、插件引用、Agent 生成同步、三 manifest 4.5.0、套件总览与 Skill 审计通过。
- Forge CLI `verify -Phase all` 返回 PASSED，staticStatus=PASSED 但 executedCheckers 为空；运行执行 9 个 API-RUNTIME-001，均验证旧服务。新增能力的静态证据为 tsc，运行证据为隔离单元/stdio/跨仓调用；不可将旧服务结果冒充新部署验收。
- 本机只读检索正式 21 个 Requirement、20 条图谱来源，单次约 488ms；图谱仍 UNVERIFIED，未测召回率/P95。
- 新版本未安装到现有服务或插件缓存，不触发重启；任务 3.4 保持未完成。当前 change 不归档、不晋升主规格。设计扫描 DESIGN_SCAN_LIMIT 已记录，未宣称完整基线治理通过。
