# Tasks

- [x] 复用现有 Git 面板、精确引用查询与切换安全边界。
- [x] 实现逻辑分组、来源筛选、搜索与详情操作。
- [x] 增加按需只读差异接口和引用版本校验。
- [x] 完成定向验证、宿主编译与质量门禁。
- [ ] 核验前端运行版本与静态资源。
- [ ] 后端新能力待用户确认重启后运行验收。
- [ ] 真实手机浏览器与跨 WebView 验收（尚未执行）。

## 验证记录（2026-11-03）

- 前端：CommitsPanel 9 项、GitBranchPicker 5 项，合计 14 项通过；typecheck 与生产 Vite 构建通过。既有 chunk 大小及混合导入告警保留，无构建错误。
- 后端：真实临时仓库 GitBranchHistoryTest 4 项（包含本地领先 1、远程领先 2 的分叉），原切换保护 4 项、工作区 8 项和 HTTP 绑定/仓库边界 4 项，20 项专项通过。40 模块宿主编译通过；公共查询最终变更重新编译与定向测试通过。
- 单独 surefire:test 目标曾使用本地仓库旧依赖，出现新增类型缺失；随后执行 tool-claude-chat reactor 的正常 test 生命周期，4 项 HTTP 用例通过。不以失败目标作为通过证据。
- 项目门禁 JSON status=PASSED、exit=0；executedCheckers 为空，executedVerifiers 为 9 项既有 API 检查，不代表新分支接口或真实浏览器已验收。
- OpenSpec strict validate 与 diff whitespace 检查通过。无数据库变更，无 AI 编程架构契约调整。
- 本次未启动或重启服务。前端沿用既有提交快照自动构建发布机制；新后端接口尚未加载。
