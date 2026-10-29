# 实施任务

- [x] 确认消息路径入口、既有 Markdown 和文件访问契约，完成设计与行为规格。
- [x] 扩展 Markdown 精确引用与有界 UTF-8 完整读取，保留图文件及图片边界。
- [x] 接入懒加载弹框、正文/源码、全屏、相对路径、返回与焦点/取消恢复。
- [x] 完成定向前后端回归、类型检查、前端构建、宿主装配与质量门禁。
- [ ] 完成真实浏览器手机、桌面和矮视口检查；若权限受限明确保留未验证范围。
- [ ] 用户明确确认重启后核验新后端与真实会话读取，完成稳定观察；本次不自行重启。

## 验证记录（2026-10-30）

- 前端 `npx vitest run --maxWorkers=1` 选择 `Markdown.document`、`Markdown.paths`、`Markdown.lazyDiagram`、`Markdown.pagePreview`、`Markdown.sitePreview`：5 文件、56 项通过，0 跳过。含 12 项文档回归，覆盖延迟读取、盘符/file URI/POSIX/相对链接、正文、源码、全屏/Escape、关闭焦点、失败重试、取消/迟到结果、同弹框文档导航、相对图片、HTML 消毒、空文件及拒绝截断正文。通用路径旧用例改用 Java 文件继续保护系统打开行为；Markdown 新行为由专门用例承接。
- `npm run typecheck`：菜单目录 60 项一致，feature 边界 0 违规、TypeScript 通过。最终源码下 `npx vite build` 通过（6458 模块，49.36 秒），核对文档懒加载产物包含最终空文件状态与当前文档去重判断。保留既有大 chunk 和静态/动态混合导入告警；无新增依赖。
- JDK 21：`mvn -pl tools/tool-claude-chat -am test '-Dtest=SessionFileControllerTest,SessionArtifactReferenceServiceTest,SessionImageControllerTest,SessionLocalPathAccessServiceTest,CodexImportedHistoryTest,ConsultHistoryAuthorizationTest' '-Dsurefire.failIfNoSpecifiedTests=false' '-Dskip.frontend=true'`，6 文件、28 项通过，0 失败、0 跳过。Markdown 完整读取超过旧文本截断阈值，验证 2 MiB、UTF-8、二进制、MDX/越界拒绝、跨目录精确引用、权限与排除；保留 Draw.io/图片/已鉴权历史页回归。
- 宿主 `mvn -pl toolbox-starter -am package '-DskipTests' '-Dskip.frontend=true'`：41 模块通过，2 分 39 秒。该步骤跳过其他测试及前端复制，前端产物独立构建；不宣称 fat jar 已嵌入本次最新前端。
- 原生质量入口 `forge-quality.ps1 verify -Project . -Format json`：status=PASSED、exit 0，executedCheckers 为空、executedVerifiers 为 9 项既有 API，不代表 Markdown 新接口运行验收。OpenSpec strict 通过，Git diff 无空白错误。
- 手机与桌面 `/tools/claude-chat` 入口已准备，状态均为 WAITING_VIEWER_AUTH。此前浏览器访问 Forge 曾被网络出口授权拒绝，本次仅清点可用窗口，未通过其他来源绕过限制；真实浏览器手机/桌面/矮视口检查和新版登录态读取尚未执行。JSDOM 不能证明布局、实际滚动及移动端可用性。
- 未重启或触发 reload，未执行新版本 60 秒稳定观察。按仓库授权边界保留当前服务，待用户对本次后端重启明确确认后执行运行验收。无整体架构契约变更，无人工待执行 SQL，不登记业务咨询更新纸签。
