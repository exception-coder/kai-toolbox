# 任务

- [x] 检查工作区和现有目录、显示偏好调用，保留两处无关测试临时目录。
- [x] 回归先复现未标记项目显示、加载中闪现及失败缺少恢复。
- [x] 图谱与配置改为显式显示；补加载、失败重试及空选择提示。
- [x] 定向回归、frontend typecheck 和 OpenSpec strict 检查。
- [x] 核对差异并提交当前任务；不发布或重启。

原工作区仅有 .test-exit-confirmation/ 与 sidecar/claude-agent/.test-exit-confirmation/ 两处未跟踪目录，本次不读取、删除或提交它们。未修改后端或生成任何人工待执行 SQL。

## 验证

- 修复前 3 项页面回归失败，明确复现新识别节点自动显示、加载期间显示及读取失败无恢复提示；修复后 3 项全部通过。模拟 API 数据覆盖新增根目录、原显示/隐藏选择、主动标记后的保存载荷与刷新、空配置和重试，不写真实用户偏好。
- 最初新增测试传入了测试库不支持的 exact 参数，typecheck 如实失败；移除无效参数后，定向回归和 `npm run typecheck` 均 exit 0，权限目录与 Feature 边界检查通过。
- `openspec validate require-explicit-consult-system-visibility --strict`、`git diff --check` 通过。
- Forge CLI verify JSON status=PASSED、exit 0；executedCheckers 为空，9 项既有 HTTP 探针通过。它们不证明新前端页面运行结果。
- 本次局部过滤、状态提示和配置初值调整未运行全量生产构建、浏览器或真机验收；未发布、重启或改变后端。按项目默认授权仅本地提交，本次新任务不自动推送。
