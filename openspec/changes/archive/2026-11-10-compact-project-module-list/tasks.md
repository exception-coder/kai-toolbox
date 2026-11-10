## 1. Implementation

- [x] 1.1 Replace module cards with compact progressive list and preserve operations.
- [x] 1.2 Add regression coverage for expansion, search, hierarchy and operation state.

## 2. Delivery

- [x] 2.1 Pass frontend tests/typecheck/build and applicable Forge verification.
- [x] 2.2 Verify desktop/mobile runtime and 60-second stability; record evidence, update docs and commit scoped changes.

## Validation evidence

- 2026-09-13 本机时间：typecheck（含 feature catalog 与 architecture check）、前端完整 build 均 exit 0。Vite 构建完成，有既有大 chunk 提示，无构建错误。
- WorkspaceModuleList 3 项组件测试、ProjectWorkspaceScope 1 项集成测试通过。覆盖 12/15 项展开收起、搜索不截断、完整路径、已有会话、钉选、pending 禁用、子模块及混合类型标题。
- Forge full verify exit 0、JSON status PASSED；9 个 API-RUNTIME-001 场景实际通过，executedCheckers=[]，不宣称执行了静态扫描。
- 真实 Forge 项目浏览器验证：默认 12 项，展开 51 项，搜索 frontend 命中全部 51 项，空搜索结果可恢复；钉选后显示聚合项，取消后恢复原状态。已有 Vibe Coding 模块显示打开会话入口。
- 桌面 1280px 为三列四行；375px 为单列，document scrollWidth/clientWidth 均为 375，无横向溢出；临时 viewport 已恢复。未创建真实 AI 会话或发送消息，会话回调由组件测试验证。
- dev 运行范围前端 HTTPS :5173、后端 :18080；Vite 已提供当前源码视图，无后端变更，未额外重启 Java。00:23:37—00:25:13 连续观察 96.2 秒，前端 PID 46980 / 后端 wrapper PID 56924 不变、restart 均 0、ready 为 true，起止 HTTP 200。既有 WeChat waiting restart(4) 不在本次范围。
- 仅提交本次前端、说明及 change 工件；其他任务工作区内容保留。保持 change 活动供后续规格合并，不自动归档无关工作。
