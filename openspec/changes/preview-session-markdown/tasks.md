# 实施任务

## 默认内嵌展示（2026-11-01）

- [x] 本地 SQL、Markdown、draw.io 链接按原文段落自动内嵌；靠近可见区才读取，保留复制、刷新、展开及失败恢复。完整解析后拆块，同段重复引用合并，文件内关联文档不递归展开。
- [x] 复用原有会话读取及类型边界，SQL 高亮抽为共享只读组件；展开共享查询结果，切会话取消读取。原弹框回归显式使用非内嵌模式，新默认行为由独立检查覆盖。
- [x] 5 文件 50 项定向检查通过（内嵌 4、文档 12、路径 23、SQL 7、图形延迟加载 4）。新增覆盖自动读取三类文件、接近视口、重复/外链/伪造属性/代码示例、文档不递归、流式追加保留 DOM、展开不重读、焦点恢复、错误/截断重试及会话取消/迟到响应。渲染器替身不证明真实高亮或图形视觉效果。
- [x] `npm run typecheck` 退出 0：59 项菜单权限一致、模块边界 0 违规；隔离 Vite 生产构建退出 0，1 分 13 秒，产物 `.run/inline-file-preview-build-20261101`，内嵌及 SQL 渲染器独立分包。保留既有大 chunk 与混合导入告警。
- [x] 质量门禁退出 0、JSON `status=PASSED`、`executedCheckers=[]`，9 项既有 API 探测通过；OpenSpec strict 与 diff 检查通过。本次只改前端展示，复用上一节未变的后端 21 项定向验证及宿主装配证据，不重复 Maven 全量验证；无整体架构契约、数据库脚本或业务咨询更新纸签变更。
- [ ] 目标前端加载后检查真实手机/桌面正文、SQL 颜色、draw.io 多页缩放、滚动及触控。当前静态前端在提交前仍为 `4244aa97d`；未重启服务，新 SQL 后端仍按上次交付边界等待加载，不把旧版接口健康探测当作内嵌功能验收。

## SQL 预览扩展（2026-11-01）

- [x] 增加 `.sql` 链接的按需只读预览、SQL 高亮与行号、原文复制、失败重试与焦点恢复，不打开系统程序或连接数据库。
- [x] 后端沿用完整 UTF-8 读取与会话/项目范围，SQL 引用独立于 Markdown/图片/图文件；拒绝越界、用户消息伪授权、只读会话范围外引用及非法/超限内容。不产生人工待执行 SQL。
- [x] 前端 4 文件 46 项定向检查通过，含 SQL 7 项，保留 Markdown 12、路径 23、Draw.io 延迟加载 4 项回归；SQL 覆盖用户示例盘符链接、file URI/相对路径、只读参数、字面 HTML、复制、空/失败/截断、会话切换取消与迟到结果。高亮组件使用替身，不能证明实际颜色和滚动表现。
- [x] `npm run typecheck` 通过（59 项菜单目录及模块边界 0 违规）；最终隔离 Vite 构建通过，1 分 25 秒，产物位于 `.run/sql-preview-build-20261101`，SQL 弹框独立按需加载，保留既有大分包/混合导入告警。3 文件 21 项后端定向检查通过（文件 9、精确引用 7、本地路径 5），同一 Maven 作业 40 模块宿主 package 成功，3 分 17 秒；没有运行全套测试或复制新前端到 fat jar。
- [x] 项目质量门禁退出 0、JSON `status=PASSED`、`executedCheckers=[]`，9 项既有接口探测通过；OpenSpec strict、diff 与编译产物检查通过。现有 Java PID 107268、Sidecar 156960 与控制器 150296 未通过本任务重启，未将旧运行接口探测当作 SQL 新功能通过。无数据库脚本、整体架构变更或业务咨询更新纸签。
- [ ] 用户明确确认本次后端重启后，核对新 `/sql` 接口及真实手机/桌面高亮、长文本、复制与恢复。本次不重启、触发 reload 或执行任何业务 SQL；入口准备和旧版探测不能代替新功能验收。

## 原 Markdown 实施

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
