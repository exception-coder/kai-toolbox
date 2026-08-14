# LaunchIntent 交接协议编码摘要

## 1. 核心规则

- 新生产者只写持久化 LaunchIntent，不再写裸 sessionStorage key。
- 消费顺序固定为 `GET → 校验 → 执行 → ACK`；任何失败都执行 `fail` 且不移除 URL。
- 后端只维护平台生命周期，不引入 project-workspace 或 claude-chat 业务依赖。
- 旧 key 只读兼容，迁移完成后按独立提交删除。

## 2. 接口入口

| 接口 | 实现 |
|---|---|
| `POST /api/launch-intents` | `LaunchIntentController#create` |
| `GET /api/launch-intents/{id}` | `LaunchIntentController#get` |
| `POST /api/launch-intents/{id}/ack` | `LaunchIntentController#ack` |
| `POST /api/launch-intents/{id}/fail` | `LaunchIntentController#fail` |

## 3. 关键方法

```text
LaunchIntentService#create(int, String, String): LaunchIntent
LaunchIntentService#getExecutable(String): LaunchIntent
LaunchIntentService#acknowledge(String): LaunchIntent
LaunchIntentService#fail(String, String): LaunchIntent
createLaunchIntent(LaunchIntentPayload): Promise<LaunchIntentView>
loadLaunchIntent(string): Promise<LaunchIntentView>
acknowledgeLaunchIntent(string): Promise<void>
failLaunchIntent(string, string): Promise<void>
```

## 4. 数据结构

```text
platform_launch_intent(
  id, protocol_version, intent_type, payload_json, state,
  last_error, created_at, expires_at, acknowledged_at, updated_at
)
```

唯一键为 `id`；索引为 `(state, expires_at)`。

## 5. 边界

- payload JSON UTF-8 最大 65536 字节。
- 协议版本只接受 `1`。
- 默认有效期 30 分钟，读取时惰性推进 `EXPIRED`。
- `ACKED/EXPIRED` 返回冲突，不执行 payload；`FAILED` 允许重试。
- 错误文本最多保存 500 字符。

## 6. 验证

- 后端测试：临时 SQLite 显式列映射、创建、失败重试、ACK 幂等和非法输入。
- 前端测试：三种 payload 校验和未知版本拒绝；页面消费流程由类型检查约束，后续补组件级行为测试。
- 运行 `scripts/quality-gate.ps1`。
