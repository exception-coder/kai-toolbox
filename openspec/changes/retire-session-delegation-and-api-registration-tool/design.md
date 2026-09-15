## Context

范围更正：用户要求保留彩虹胶囊只读咨询。此前完整切片删除误包含胶囊网关；胶囊认证和固定只读策略由 [独立修复设计](../restore-capsule-relay-without-delegation/design.md) 恢复，委托 Grant/Invitation/SDK 仍退役。本设计中的外部 Relay 删除范围限定为委托协议。

当前实现横跨 React 会话页与 Explore 指南、`tool-claude-chat` 的委托聚合和公共网关、Sidecar Tool/权限策略、独立浏览器 SDK 与 Spring Boot Relay Starter。接口登记又通过 `register_affected_apis` 写入会话表，再投影到 OpenSpec 看板，和 OpenSpec 自身的规范形成重复事实源。

本设计遵循产品原则 OBJ-01、NAV-01、AI-01、CTRL-01：删除非核心对象和入口，保持 OpenSpec 上下文连续，删除不可兑现的自动化暗示，并让控制边界回到会话所有者。无原则例外。

## Goals / Non-Goals

**Goals:**

- 完整移除用户可达的委托、公共 Session Client/Relay 和两套 SDK。
- 完整移除 Agent 的接口登记 Tool 与会话级接口证据投影。
- 保持普通 Vibe Coding、自动监督、OpenSpec 看板和 Quality Gate 不受影响。
- 通过不删除历史表数据提供可回滚边界。

**Non-Goals:**

- 不删除普通评审、需求登记或 OpenSpec 自动监督。
- 不执行数据库 DROP 或清理历史授权数据。
- 不新增另一套接口扫描/登记服务。

## Decisions

### 删除完整垂直切片而非隐藏导航

同时删除 UI、路由、协议、服务、SDK、配置与测试。仅隐藏页签仍会留下可调用攻击面和持续维护义务，因此不采用。

### OpenSpec 直接承载接口契约

接口 method/path、行为、兼容性与验收写入 change 的 specs/design/tasks；不再让 Agent 调用人工登记 Tool，也不在看板 DTO 中维护 `affectedApis`。这避免 OpenSpec 与数据库台账冲突。

### 保留物理历史数据

从启动 schema 中移除退役表的创建语句，但不发布 DROP。已有安装的数据保持只读遗留状态；回滚旧版本时仍可识别。若未来要求物理清理，另开带备份和显式授权的迁移。

### 保留通用会话控制模式

`CODE_AGENT`/`LLM` 控制模式和普通会话权限不是委托能力，不随本次删除。只移除以 Grant、Invitation、Participant、Relay 为身份边界的链路。

## Risks / Trade-offs

- [旧客户端立即失效] → 以明确 404/无 WebSocket handler 作为退役结果，并同步删除接入文档。
- [历史表残留] → 不再读写、不再新建；以数据安全优先，后续单独治理。
- [误删通用权限策略] → 通过引用扫描和普通会话/自动监督回归测试区分通用控制模式与委托策略。
- [工作区存在其他未提交改动] → 仅修改和暂存本 change 文件；共享文件逐块核对。

## Migration Plan

1. 删除前端入口、指南与 SDK 包。
2. 删除后端公开端点、委托领域切片、Relay Starter 及装配配置。
3. 删除 affected API Tool、HTTP/存储/看板投影，保留 OpenSpec 文档能力。
4. 执行前后端测试、strict validation、Forge Quality Gate 和运行路由验收。
5. 回滚时恢复代码与配置；因历史表未删除，无需数据恢复。

## Open Questions

无。
