# 咨询引擎选择协议变更

## 1. 浏览器到 Java

WebSocket `open` 消息新增可选字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `engine` | string | 否 | `claude` 或 `codex`，默认 `claude` |
| `codexHome` | string | 否 | Codex 官方登录配置根目录；空值使用默认目录 |

## 2. Java 到 sidecar

`start` 与 `resume` 消息新增同名可选字段 `codexHome`。sidecar 不向浏览器回传目录内容，仅将其用于创建 Codex SDK 客户端。
