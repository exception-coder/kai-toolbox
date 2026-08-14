# LaunchIntent 跨页面交接

## 主链路

1. 生产者调用 `createLaunchIntent`，后端校验协议版本、类型和 64 KiB 大小限制。
2. `LaunchIntentService#create` 写入 `platform_launch_intent`，初始状态为 `PENDING`，有效期 30 分钟。
3. 页面只用 `?launchIntent={id}` 导航到 Vibe Coding，不在浏览器存储中复制业务 payload。
4. `ChatPage` 读取并运行时校验 payload，按类型执行打开草稿、打开并发送或打开面板。
5. 实际动作成功后调用 ACK；失败时写 `FAILED/last_error`，保留 URL 并显示重试入口。

## 不变量

- 新生产者不得再写旧的裸 `sessionStorage` handoff key。
- `ACKED/EXPIRED` 不可再次执行；`FAILED` 可用同一个 ID 重试。
- 草稿意图必须等新会话 ID 就绪并成功写入草稿后 ACK。
- 后端平台层只维护交接生命周期，不解释 PRD、知识图谱或项目工作台业务。
- 旧 key 仅作为消费者兼容分支保留一个迁移周期，删除须独立变更并确认无旧版本生产者。

## 失败恢复

- 创建失败：生产页原地显示错误，不导航。
- 消费失败：记录 `FAILED`，Chat 页显示原始错误和“重试”。
- 页面刷新或浏览器重开：SQLite 中 payload 仍可由原 URL 重新读取。
- 超过 TTL：服务端推进为 `EXPIRED` 并返回冲突，不执行陈旧动作。
