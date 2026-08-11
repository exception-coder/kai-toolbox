# Java8 股知识库 API

## 1. 接口清单

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/java8/categories` | 返回完整知识树 |
| GET | `/api/java8/nodes/{id}` | 返回节点、示例和面试卡片聚合详情 |
| GET | `/api/java8/nodes/{id}/relations` | 返回双向关联节点 |
| GET | `/api/java8/interviews/{nodeId}` | 返回节点面试卡片 |

---

## 2. 通用约定

- 无认证，本地单用户使用。
- ID 为稳定字符串，可用于 Markdown 种子重复导入。
- 节点不存在时返回 HTTP 404。
- 时间字段为 ISO-8601 字符串。

---

## 3. 知识树响应

```json
[
  {
    "id": "stream",
    "title": "Stream 流",
    "nodeType": "CATEGORY",
    "children": []
  }
]
```

---

## 4. 节点详情响应

```json
{
  "node": {
    "id": "stream-lifecycle",
    "title": "Stream 为什么不能重复使用",
    "summary": "Stream 是一次性计算流水线",
    "content": "## 一句话理解"
  },
  "examples": [],
  "interviews": []
}
```
