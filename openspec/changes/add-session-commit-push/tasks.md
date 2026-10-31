## 2026-10-31 多分支提交浏览

- [x] 沿用既有目录边界提供本地/远端分支列表与指定引用的只读提交查询，保留旧查询兼容。
- [x] 仓库内横向分支标签、当前标记、详情与换仓/刷新恢复；其他分支收起同步按钮，迟到响应隔离。
- [x] 定向前后端验证、前端生产构建、宿主装配与已有项目门禁，提交实现。
- [ ] 目标后端版本启动及运行验收；须先取得本次重启授权，不能以旧运行响应代替。

适用 OBJ-01、CTX-01、DENS-01、CTRL-01、FEED-01，无例外。采用 L2 轻量扩展并复用本 Change，不新增完整规格大纲。Graphify 既有超大图查询限制沿用有界源码定位。无人工待执行 SQL、无 AI 编程架构生命周期变更。真实浏览器/手机验收仍未执行，当前会话浏览器访问拒绝边界不变，不采用替代入口绕过。

验证：前端 7 项定向回归通过（通用弹层 6、会话目录管理接入 1），覆盖分支/目录迟到响应、旧 diff 失效、被删分支刷新、后台接口不可用恢复及既有拉取/推送保护。Java 7 项通过（Git 分支真实临时仓库 2、既有报告读取兼容 1、会话控制器 4），验证本地/远端分支各自历史、符号别名排除、HEAD/暂存区/未提交文件不变、空仓库与 detached HEAD、拒绝非实际分支表达式及 HTTP 参数兼容；未 fetch、checkout 或推送真实项目。原生前端 build（含 TypeScript/架构检查/内嵌助手链与其 2 项脚本测试）成功，保留既有 chunk 警告。后端定向 reactor test 成功；宿主 41 模块 package 成功，跳过无关测试和前端重复构建，确认 fat jar 包含本次 common 与 claude-chat 制品；静态前端独立发布，不声称此次更新了 jar 内前端。OpenSpec strict、diff 检查通过。Forge CLI JSON PASSED、退出 0，实际 9 个旧运行 API 探针、静态 checker 为空，不证明新分支接口已运行。当前后端 wrapper 153064、前端 160864、static 版 acb6a5eba04e541923201683；未重启，新接口、真实浏览器功能验收与 60 秒新后端稳定观察均待本次用户重启确认。

## Implementation

- [x] 1.1 Reuse the project push implementation through a shared port and expose session-scoped preview/push APIs.
- [x] 1.2 Add preview, inline confirmation, pending protection and recovery to full-screen and floating commit history.
- [x] 1.3 Verify backend boundaries and real temporary-remote push, frontend states, types/build, OpenSpec and Forge gate.
- [x] 1.4 Verify desktop and mobile UI with simulated APIs; no actual external push.
- [ ] 1.5 Deploy and verify the target services after explicit restart authorization.
