# LaunchIntent API 契约

## POST /api/launch-intents

请求：`{ protocolVersion: 1, type: string, payload: object }`。

响应：`{ id, protocolVersion, type, payload, state, createdAt, expiresAt, lastError }`。

## GET /api/launch-intents/{id}

返回可执行的 `PENDING` 或 `FAILED` 意图；不存在返回 404，已确认或过期返回 409。

## POST /api/launch-intents/{id}/ack

空请求体。成功后状态为 `ACKED`；重复调用幂等。

## POST /api/launch-intents/{id}/fail

请求：`{ error: string }`。记录可诊断错误并保持可重试。

