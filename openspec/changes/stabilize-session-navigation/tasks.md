## 2026-10-31 最近查看快捷入口调整

- [x] 最近会话跨项目平铺；手动置顶优先，普通项按明确查看顺序排列，保留目录辨识信息。
- [x] 最近与项目会话入口记忆查看次序；按用户及浏览器隔离，保留条数、筛选、权限和存储失败反馈。
- [x] 复用原最近/项目列表回归，执行类型、构建、严格规格及质量检查后本地提交。
- [ ] 桌面与手机实际交互验收；若浏览器策略阻止，明确记录未验证范围并准备预览入口。

本次验证：原 RecentSessions 8 项及 SessionList 11 项定向回归全部通过（19/19）；包含跨项目 MRU、手动置顶优先、条数边界、重新挂载回读、不可见会话移除、用户范围和存储失败恢复。类型检查与生产构建通过（59.90 秒）；保留既有混合导入及大包警告，未执行共享 SDK 发布或更新宿主制品。

OpenSpec 严格校验通过；Forge 全阶段 JSON PASSED、退出码 0，Static 无 executedChecker，Runtime 只执行 9 项既有 API 探针，不作为新排序视觉或端到端验收。现有前后端 PID 133112/150408 未变、重启次数 0；开发服务返回新版平铺组件 HTTP 200。这些只读证据不代替手机实际交互验收。

手机和桌面 `/tools/claude-chat` 预览入口均已准备，状态 WAITING_VIEWER_AUTH。沿用本会话已记录的浏览器安全策略阻断：本地预览协议被拒且不允许通过其他通道绕过；未取得新版实机布局、键盘焦点或滚动行为验收证据。未重启、发布或推送。此前验证记录仅适用于当时快照，不能代替本次验收。

## 本地实现

- [x] 修正查看/连接恢复的活动时间写入，保留真实执行状态。
- [x] 最近与项目会话导航复用稳定排序快照，后台活动提示并支持主动更新排序。
- [x] 原更多菜单改为显式置顶/取消，保留项目分组，置顶项不受普通最近条数裁剪。
- [x] 复用模块 KV 和访问控制实现用户独立持久化，兼容原拥有者旧收藏。
- [x] 完成定向回归、类型/边界和前端构建、宿主装配及项目质量门禁。
- [x] 完成桌面/手机隔离浏览器验证，核对顺序、滚动、菜单焦点及错误恢复。
- [x] 同步产品原则和模块使用说明。

## 目标版本运行验收

- [ ] [MANUAL_PRODUCTION] 取得本次重启确认后，加载目标前后端验证真实三会话切换、跨用户置顶与刷新回读；核查 HTTP/日志和至少 60 秒稳定观察。未部署、未执行。

## 验证记录

- 2026-10-24：RecentSessions、SessionList、sessionProjectGroups 共 31 项前端定向用例通过。覆盖三会话切换、后台消息不重排、项目次序、手动更新、置顶/取消及最近条数边界；原分组、复制、重命名和菜单焦点用例保留。
- `npm run build` 通过，包含 TypeScript、Feature boundaries、Assistant SDK 与生产构建。
- JDK 21：`mvn -pl toolbox-starter -am package "-Dtest=SessionPinServiceTest,ClaudeChatServiceDuplicationTest,ClaudeChatSessionRepositoryRowMappingTest,ClaudeChatSessionListTest" "-Dsurefire.failIfNoSpecifiedTests=false" "-Dskip.frontend=true"` 通过。11 项后端定向测试，含真实 SQLite 用户偏好隔离与回读、HTTP 访问限制/单次偏好读取、活动时间不变与状态校正；宿主装配打包成功。本次前端未重新嵌入 jar，未启动目标制品。
- Firefox 155，1440×900 和 390×844：真实组件与生产 CSS、HTTP 夹具验证三次切换、滚动位置、后台活动提示、显式排序、置顶失败/重试、刷新回读、取消置顶、Escape 焦点恢复及菜单不越界。无脚本错误、无横向溢出。该结果不代替目标后端已加载的证明。
- OpenSpec strict validation 和 `git diff --check` 通过；质量 CLI JSON PASSED、退出码 0，executedCheckers 为空，9 项既有 API 探测通过。未将既有 API 探测作为新置顶 API 的运行验收。
- 根因是查看/连接恢复写活动时间加轮询即时排序，不是点击直接调用置顶 API。旧活动列可能已含访问时间，未无证据回填历史，不新增人工 SQL。
