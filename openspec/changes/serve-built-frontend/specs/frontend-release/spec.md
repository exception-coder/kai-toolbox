## ADDED Requirements

### Requirement: 运行完整生产前端
Forge SHALL 提供独立于后端 dev/full 的 static 前端模式，仍由统一入口和受管前端进程拥有 HTTPS、API/WS/SSE 与控制代理。静态服务 MUST 不提供开发源码或将缺失脚本回退为 HTML。

#### Scenario: 首次启动尚无产物
- **WHEN** 已选择 static 且无有效资源版本
- **THEN** 状态和首页返回未就绪，只有完整候选发布后才报告前端 ready

### Requirement: 从提交快照原子更新
自动构建 MUST 只读取已提交 frontend 树，串行构建并验证完整性后切换。失败 MUST 保留旧版，后端独立提交 MUST NOT 重建前端。旧资源 SHALL 按明确保留策略继续可读。

#### Scenario: 构建期间失败或有未提交改动
- **WHEN** 工作区有未提交源码或候选构建失败
- **THEN** 未提交内容不进入候选，失败不改当前版本或停止服务

### Requirement: 页面更新保护上下文
生产页面 SHALL 检测发布版本并提供稍后和刷新；业务页 MUST 等待用户确认，只有保守判定为空闲的首页可以自动刷新一次。

#### Scenario: 编辑或生成期间发布新版
- **WHEN** 页面不是首页或存在输入、聊天引擎、mutation、busy/对话框或页面隐藏
- **THEN** 不自动刷新，当前页面保持运行，用户可保存后显式确认刷新
