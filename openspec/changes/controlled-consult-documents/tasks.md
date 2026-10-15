# 实施与验证

- [x] 实现结构化 docx/xlsx/pptx 生成、受控存储、内容幂等和额度。
- [x] 接入 Codex/Claude 工具装配与凭据，保留只读沙箱和命令拒绝。
- [x] 当前咨询/归档提供授权下载、文件列表和位置。
- [x] 同步 AI 编程架构的受限能力边界与流程图。
- [x] 后端专项回归、宿主装配、Sidecar 编译/回归、frontend typecheck/专项验证。
- [x] 浏览器窄屏及桌面组件验证。
- [ ] 用户明确确认重启后，真实咨询生成下载及运行稳定观察（不属于本次已授权操作）。

## 已获得的证据

- JDK 21 下 `mvn -pl tools/tool-fore-consult -am test`，定向选择文档服务、控制器、装配、访问权限及流程回归：38项通过，0跳过。包括无符号链接权限时使用 Windows junction 验证目录越界拒绝，真实 docx/xlsx/pptx 重新打开，以及精度、公式文本、额度与重试幂等。
- `mvn -pl toolbox-starter -am test` 定向执行同组回归及 ConsultDocumentClasspathTest、McpRuntimeCompatibilityTest：宿主额外2项通过，反应堆编译成功；没有执行宿主全套用例。
- Sidecar TypeScript 在独立目录编译成功；consultResourceMcp、consultToolAssembly、codexSecurity、knowledgeQuery 共21项通过。默认 build 脚本因运行中 Sidecar 禁止覆盖 dist 而停止，未替换运行制品。
- frontend typecheck（含权限目录、模块边界）通过；文档组件/链接/失败重试、窗口和显式项目可见性11项通过。Vite 生产构建成功，产物放 `.git/consult-documents-frontend-production`，保留已有大分包警告，未发布。
- 真实浏览器组件预览使用明确标注的示例数据：390×844 与1280×800 无页面横向溢出；下载按钮44px高，受控长路径换行；模拟404后显示错误、仍可重试，追问草稿保留。此证据不代表真实AI已生成文件或新版后端已加载。
- OpenSpec strict 校验、git diff --check 通过。项目质量入口 JSON status=PASSED，0个静态检查器、9个既有HTTP探针；不把这些探针记为新文档API验收。
- 未调用任何服务起停或重启入口。作业前后运行身份有变化，不能用当前进程健康替代目标版本验收；真实运行、稳定观察和生产上线保持未完成。
- 临时预览源码已删除；自动审批拒绝递归清理独立 Sidecar 编译目录，保留为未跟踪文件，不进入提交。
