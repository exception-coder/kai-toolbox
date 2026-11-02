# Tasks

- [x] 复用现有 Git 面板、精确引用查询与切换安全边界。
- [x] 实现逻辑分组、来源筛选、搜索与详情操作。
- [x] 增加按需只读差异接口和引用版本校验。
- [x] 完成定向验证、宿主编译与质量门禁。
- [x] 核验前端运行版本与静态资源。
- [ ] 后端新能力待用户确认重启后运行验收。
- [ ] 真实手机浏览器与跨 WebView 验收（尚未执行）。

## 验证记录（2026-11-03）

- 前端：CommitsPanel 9 项、GitBranchPicker 5 项，合计 14 项通过；typecheck 与生产 Vite 构建通过。既有 chunk 大小及混合导入告警保留，无构建错误。
- 后端：真实临时仓库 GitBranchHistoryTest 4 项（包含本地领先 1、远程领先 2 的分叉），原切换保护 4 项、工作区 8 项和 HTTP 绑定/仓库边界 4 项，20 项专项通过。40 模块宿主编译通过；公共查询最终变更重新编译与定向测试通过。
- 单独 surefire:test 目标曾使用本地仓库旧依赖，出现新增类型缺失；随后执行 tool-claude-chat reactor 的正常 test 生命周期，4 项 HTTP 用例通过。不以失败目标作为通过证据。
- 项目门禁 JSON status=PASSED、exit=0；executedCheckers 为空，executedVerifiers 为 9 项既有 API 检查，不代表新分支接口或真实浏览器已验收。
- OpenSpec strict validate 与 diff whitespace 检查通过。无数据库变更，无 AI 编程架构契约调整。
- 本次未启动或重启服务。前端沿用既有提交快照自动构建发布机制；新后端接口尚未加载。

## 前端运行核验

- 2026-11-03 07:04:52（北京时间），既有静态构建器发布源码 70a05ccd846c6186737ba11db64dda5d2c29d4bd，frontend tree 为 6d66d0dbe162b586dba6961e6d22621a44af610c，资源版本 210ceecc667c2d3064740ab9。发布日志确认服务进程保持运行。
- 07:05:20—07:06:32 连续观察 72 秒：页面、实际 CommitsPanel-e8adi9Vr.js 资源与既有后端 API 均返回 200；页面版本匹配，资源包含分组和差异核对入口。
- 观察起止 backend=50144、frontend=157436、studio=136208，全部 ready/online、restarts=0，PID 与重启次数未变化。前端 buildState=ready，无当次发布致命异常。
- 此证据仅证明新前端资源已服务与进程稳定；新增后端比较接口及来源信息尚未在运行进程加载，真实 Android Chrome、iOS Safari、飞书 WebView 点击验收未执行。预览入口状态 WAITING_VIEWER_AUTH，不能代替验收。