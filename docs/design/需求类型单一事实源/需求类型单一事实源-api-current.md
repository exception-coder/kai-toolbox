# 需求类型单一事实源 API 变更

## `GET /api/reqpool/items` 与 `GET /api/reqpool/items/{id}`

`ReqItemView` 新增以下响应字段：

```json
{
  "reqType": "BUG_FIX",
  "reqTypeSource": "AI",
  "reqTypeConfidence": 0.86
}
```

字段约束：

| 字段 | 类型 | 取值 |
|------|------|------|
| `reqType` | string | `BUG_FIX`、`MODULE_ADJUST`、`NEW_MODULE`、`UNKNOWN` |
| `reqTypeSource` | string | `EXPLICIT`、`AI`、`PRD_SESSION`、`UNKNOWN` |
| `reqTypeConfidence` | number | `0.0..1.0` |

存量记录缺少持久化值时，API 返回 `UNKNOWN`、`UNKNOWN`、`0`，不返回 `null`。

## `POST /api/reqpool/items`

请求结构不变。服务端根据 `title`、`description` 解析并持久化需求类型。响应包含新增字段。

## `PUT /api/reqpool/items/{id}`

请求结构不变。仅当 `title` 或 `description` 的有效值发生变化时重新解析类型；状态、负责人等无关编辑不会调用分类器。

## `POST /api/reqpool/sync-from-prd`

路径和响应结构不变。同步查询会读取 PRD 会话的 `req_type`，镜像条目保存：

```json
{
  "reqType": "MODULE_ADJUST",
  "reqTypeSource": "PRD_SESSION",
  "reqTypeConfidence": 1.0
}
```

该流程不重复调用 Agent。
