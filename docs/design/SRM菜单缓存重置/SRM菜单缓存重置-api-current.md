# SRM 菜单缓存重置 API

## 删除 Redis 前缀键

`POST /api/ops/datasources/{id}/redis/keys/delete-by-patterns`

请求：

```json
{
  "patterns": [
    "system_menu:*",
    "menu_role_ids:*",
    "permission_menu_ids:*"
  ]
}
```

响应：

```json
{
  "patterns": [
    { "pattern": "system_menu:*", "deleted": 1 },
    { "pattern": "menu_role_ids:*", "deleted": 12 },
    { "pattern": "permission_menu_ids:*", "deleted": 8 }
  ],
  "totalDeleted": 21,
  "elapsedMs": 36
}
```

约束：

- `id` 对应的数据源必须是 Redis。
- `patterns` 必须包含一至十项，服务端会去除首尾空白并去重。
- 每项只能采用“安全字面前缀 + 单个末尾 `*`”形式。
- 接口只删除匹配键，不执行数据库变更，也不支持通用 Redis 命令。

