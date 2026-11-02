# 实施任务

初始 HEAD 908a42316，tracked 工作区干净，保留已有未跟踪缓存。Graphify 查询因图超过 512MiB 上限失败，复用定向源码事实。L3，新增应用身份与企业隔离。

- [x] 1.1 完成应用授权、短期认证和异步分析 API，验证隔离、幂等、取消及恢复。
- [x] 1.2 完成结构化分析、受控证据读取及输出校验，验证无工具、无凭据泄漏和无伪造引用。
- [x] 1.3 完成 SDK 后端客户端、合同及可运行脱敏示例，并通过 SDK、宿主编译、定向测试和项目质量门禁。
- [ ] 1.4 [MANUAL_CONFIRMATION] 用户明确确认重启后核对目标版本并用真实测试问题、多应用/企业完成运行验收及稳定观察；正式地址和服务凭据通过安全渠道交付。
- [x] 1.5 补齐管理员应用凭据页面、无密钥元数据查询、分析开关关闭时准备授权、颁发请求幂等/撤销保护，并完成针对性验证。
- [ ] 1.6 [MANUAL_CONFIRMATION] 用户确认加载新版本后，完成页面桌面/手机/矮屏真实浏览器验收、复制与下载实际回执及运行稳定观察；不以预览入口或组件测试代替。

## 验证记录

- 宿主 reactor 编译、6 个定向测试类共 34 项通过，0 failure/error/skipped；覆盖新 API、原用户 WSS、受管取消与原一次性能力兼容。最终仅参数空项防护与安全错误日志有更新，fore-consult 的 13 项整组再验通过，不重复计算独立用例数。
- SDK 0.2.0 构建和 14 项测试通过；tarball 在独立目录离线安装，通过公开 `/backend` 子路径导入与 TypeScript 严格检查；Node 后端示例语法通过。包 SHA256：77D731988447EC229AC58E4B4CC5A08B8DEB5CE8551A5654AEFAAA685D506457。
- OpenSpec strict、OpenAPI YAML 解析及 33 个本地引用解析通过；并未运行独立的完整 OpenAPI 标准验证器。真实 HTTP 合同以 MockMvc 的成功/拒绝/恢复验证为证据，不声称公网已联调。
- 项目质量 CLI 最终 JSON 为 PASSED，退出码 0。executedCheckers 为空；9 项既有 tools/procurement HTTP 检查通过，仅证明原运行服务的这些接口，不代表本次分析 API 已加载。
- 新架构流程 Mermaid 使用仓库 Mermaid 解析通过。浏览器安全策略拒绝 file:// 本地预览，未绕过；视觉渲染未验收，忽略目录下预览 HTML 不作为已验收交付物。
- prepare_sql_context 为 PARTIAL：CONSULT_SERVICE_CLIENT、CONSULT_SERVICE_TOKEN、CONSULT_ANALYSIS_TASK 三张新表未命中 DDL 基线；仅应用启动 IF NOT EXISTS schema，无人工待执行 SQL。
- 实现验收时未重启、未推送、未发布 npm、未创建实际应用凭据；后续源码推送以 Git 远端回执为准，不能据此标记运行验收完成。未修改 yoooni-agent 工程。候选生成、人工编辑保存和飞书确认发送属于接入方，不能由 Forge mock 测试替代验收。开发运维改动不登记业务小纸条。
- 补充 sdk/forge-consult-client/HANDOFF-YOOONI-AGENT.md，供项目组执行接入，区分客户端可开工与环境待启用；交付包携带接口正文、OpenAPI、可运行示例及 SDK，不包含凭据。
- 交接补充仅改变文档与 npm 包文件清单，无架构或运行行为变更。SDK 14 项测试再次通过；重打包加入交接文档，新 tarball SHA256 为 0A2907C1BA750688AE78A00DD1A74E1D15F8ADA5490EC0BAB06DD53C1BC3A583，替代上文实现时的包。项目质量 CLI 再验 PASSED / exit 0，仍仅执行既有 9 项运行检查，未验收新接口。

## 管理页面补充验证（2026-11-02）

- 基线 HEAD 730e4177c，tracked 干净；保留既有未跟踪缓存及之前准备但未加载的本地私有启用配置。沿用本 change 的 L3，新增管理员读取及敏感凭据展示规则，复用既有授权表和公共服务，不扩展普通用户或应用权限。
- 宿主 reactor 定向验证 ConsultBackendIntegrationTest 16 项通过，0 failure/error/skipped，覆盖管理元数据无密钥/摘要、匿名/普通用户/应用票据拒绝、关闭分析时管理员准备与业务拒绝、请求 UUID 并发去重、旧无请求头独立多组授权兼容、过期状态及撤销幂等。
- 前端 3 个定向测试文件 17 项通过：管理页面 8 项、原管理设置 3 项、原咨询显示/草稿 6 项；覆盖一次性结果清除、无凭据 Query/存储缓存、未知结果不自动重发、刷新复用请求 UUID、轮换/撤销确认、复制失败恢复及失去 ADMIN 清除界面。
- 最终 typecheck、59 项菜单目录一致性及 feature boundaries 通过；最终生产 Vite 构建输出 outputs/consult-backend-admin-frontend（未替换运行服务产物）。既有大 chunk 提示保留，不当作错误或消除其他模块警告。
- 项目质量 CLI 最终 JSON PASSED / exit 0，executedCheckers 为空，executedVerifiers 为既有 9 项运行检查；不代表新增页面/API 已加载。OpenSpec strict、更新 Mermaid 语法、OpenAPI YAML 与本地引用、Markdown/包内链接和 JSON 示例校验通过。流程图未完成实际渲染检查。
- SDK 运行代码及版本未改，重打包同步管理页面/可选颁发请求头文档，新 SHA256 为 1BC7B65DD5B48F9F54EE43B8CB43E39D7A5DB7634C86A1B61E587951BBCD7CE9，替代上述旧包；复用运行代码未变的 SDK 14 项测试证据。
- 浏览器通道返回 browser access host is unavailable。已准备 /tools/fore-consult/access 的桌面与手机入口，均为 WAITING_VIEWER_AUTH；未自动登录、截图或执行页面验收。源版本标签只是定位信息。
- prepare_sql_context 返回 PARTIAL，CONSULT_SERVICE_CLIENT 未命中运行 DDL 基线；字段依据既有模块 schema，DDL 未核验。仅增加元数据 SELECT 及调整正常运行的撤销条件，无新表/迁移或人工待执行 SQL。
- 未重启任何服务，未签发真实应用凭据，未执行真实模型分析或跨系统联调；未推送本次管理页面改动。管理运维能力不登记业务小纸条。
