# SRM 菜单缓存一键重置编码摘要

## 实现状态

已实现。SRM 需求开发页新增缓存重置卡片，通过系统中间件台已登记的非生产 Redis 数据源执行固定菜单缓存清理。

## 前端

- `frontend/src/features/srm-dev/components/SrmMenuCacheResetSection.tsx`
  - 自动筛选名称或编码包含 SRM 的系统。
  - 只显示非生产 Redis 数据源。
  - 执行前确认目标实例和三个固定键模式。
  - 展示逐模式删除数量、总数、耗时和后续重新登录提示。
- `frontend/src/features/srm-dev/api.ts`
  - 新增安全前缀键清理 API 类型与调用。
- `frontend/src/features/srm-dev/pages/SrmDevPage.tsx`
  - 在服务启停和测试库配置之间挂载常用操作卡片。

## 后端

- `OpsQueryController#deleteRedisKeysByPatterns`
  - 提供 `POST /api/ops/datasources/{id}/redis/keys/delete-by-patterns`。
- `OpsQueryService#deleteRedisKeysByPatterns`
  - 校验数据源类型，调用安全策略和连接器，将结果写入既有 Ops 历史。
- `RedisKeyPatternPolicy#normalize`
  - 限制模式数量，执行去重，拒绝宽泛或嵌入式通配符。
- `RedisConnector#deleteByPatterns`
  - 通过 `SCAN` 收集匹配键，按 200 个一批执行 `DEL`。

## 验证

- `npm run typecheck` 通过。
- `mvn -pl tools/tool-ops -am test` 通过，共 16 项测试。
- 新增安全模式策略 3 项测试与 Redis SCAN/DEL 连接器 1 项测试。

