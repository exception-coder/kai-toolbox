## 1. 功能与验收

- [x] 1.1 补齐同入口终止、删除、清空与持久撤回，覆盖前后端定向回归、构建和质量门禁。
- [x] 1.2 同步行为、架构流程与使用文档，核对范围并提交。

## 验证记录

本次按 L2 处理：既有会话队列的有限控制补齐，沿用原访问权限，没有身份隔离变化或数据库迁移；并发与异步终态风险由设计、现有集成夹具及专项验收承接。

- `QueueReliabilityTest` 19 项、`QueuedChatMessageServiceTest` 3 项、`ClaudeChatQueueReleaseTest` 3 项，最终共 25 项通过。真实临时 SQLite 覆盖挂起终止、活动轮次删除、迟到成功、重建服务不复活、手动恢复发送、错轮拒绝、中断未送达保留、锁外查询及 RPC 后轮次复核、只清除确认 ID；未调用真实模型。
- 队列组件和 Dock 共 13 项、会话隔离 Hook 23 项通过，共 36 项；新增请求处理中互斥，现有 Dock 用例调整为等待请求完成后继续下一操作。新覆盖停止请求绑定原会话，切换后迟到失败不污染当前会话。
- `npm run typecheck` 通过，含菜单目录及架构边界检查；`npx vite build --outDir ../.run/queue-control-build` 通过（保留大分包警告）。产物在独立目录，未替换受管前端。
- `mvn -pl toolbox-starter -am compile "-Dskip.frontend=true" "-Dstyle.color=never"` 39 个模块编译通过，覆盖宿主类路径。专项测试单独执行，不把 compile 计为全量测试或发布。
- 离线 Chromium 使用真实组件与演示数据，在 390px／1280px 验证终止、删除、其他消息保留，未触发发送；新构建 CSS 下内容宽度检查通过，24px 根字号下无横向溢出。截图人工复核；未接入当前运行服务或真实用户数据。临时夹具和截图留在 `.run/queue-control-*`，不提交。
- 架构说明的队列 Mermaid 流程已实际渲染并检查，OpenSpec 严格校验通过，`git diff --check` 通过。
- Forge Quality Gate 退出 0，JSON `status: PASSED`；实际静态 checker 0 项、现有通用工具 API verifier 1 项，运行目标是既有服务，不证明本次新接口上线。
- `prepare_sql_context` 返回 DDL_MISSING：知识库缺上述三表基线。仓库 schema 与临时 SQLite 是本次实现验证依据，不声明已核验真实运行库 DDL；无人工执行 SQL 或迁移。
- 手机／桌面页面预览入口均已准备，状态 WAITING_VIEWER_AUTH；准备入口不等于已登录、已加载新版或真实会话验收。

## 运行边界

本次未获重启授权，不触发服务重启。新版本运行验收、手机真机检查及稳定观察待当次授权后执行，不能以源码测试或预览入口准备替代。
