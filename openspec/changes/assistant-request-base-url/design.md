## Context

当前 `frontend/src/assistant-loader/loader.ts` 只用 `baseUrl` 定位版本清单和 SDK 产物，`frontend/src/assistant-sdk/assistantSdk.ts` 则要求宿主额外配置 `wsUrl` 与 `externalLogin.loginUrl`。这使默认公网 Forge 接入重复，也容易在切换内网 IP 时只替换部分端点。

当前实现坐标：

- `frontend/src/assistant-loader/loader.ts`：Loader 资源基址推导与运行时加载。
- `frontend/src/assistant-sdk/types.ts`：对外初始化契约。
- `frontend/src/assistant-sdk/assistantSdk.ts`：外部登录与 WebSocket Transport 组装。
- `frontend/src/assistant-sdk/AssistantWebSocketTransport.ts`：从 WebSocket 地址派生附件和反馈归档 HTTP 端点。

## Goals / Non-Goals

**Goals:**

- 一个 `requestBaseUrl` 成为 Forge 通信域的单一配置源。
- Loader 默认从自身资源域注入请求域。
- 宿主可以在 Loader 或 SDK 初始化时指定内网 HTTP IP。
- 用户可以在胶囊内覆盖当前浏览器使用的 Forge 请求域，并恢复宿主默认值。
- 保留现有 `wsUrl` 和 `externalLogin.loginUrl` 覆盖能力。

**Non-Goals:**

- 不绕过浏览器 Mixed Content、CORS 或 WebSocket Origin 安全规则。
- 不跨浏览器、跨设备或跨 `appId` 同步用户请求域。
- 不改变 Loader 产物分发域；`baseUrl` 与 `requestBaseUrl` 保持独立语义。

## Decisions

1. **分离资源域与请求域**：`baseUrl` 继续只服务于 SDK 发布产物，`requestBaseUrl` 只服务于业务请求。不复用 `baseUrl`，避免内网请求被误用于下载产物。
2. **Loader 注入默认值**：`load()` 返回一个轻量运行时门面，在 `initialize()` 时按“初始化参数 > Loader 参数 > Loader 脚本 Origin”合并 `requestBaseUrl`。
3. **统一端点派生**：未显式配置 `wsUrl` 时，从请求域派生 `/api/claude-chat/consult/ws`，并按 HTTP/HTTPS 转换为 WS/WSS；外部登录启用且未指定 `loginUrl` 时派生 `/api/auth/external-login`。附件与归档 HTTP 仍由 Transport 从最终 WebSocket URL 派生。
4. **请求域只接受 HTTP(S) Origin**：规范化为 `URL.origin`，拒绝其他协议。用户名、密码、路径、query 和 fragment 不进入最终请求域。
5. **浏览器级用户覆盖**：按 `appId` 将用户选择写入 `localStorage`，优先级高于 SDK 初始化与 Loader 默认值；只保存 Origin，不保存账号、密码或 Token。
6. **保存后重新载入宿主页**：连接客户端在初始化阶段组装，运行中替换会使宿主持有的 SDK 引用失效。因此设置界面明确执行“保存并重新载入”，由下一次初始化统一重建登录、附件、归档和 WebSocket 客户端。
7. **移动端保持安静头部**：现有“调试”入口改为“连接”，同一面板先展示连接设置，再以折叠区保留请求日志，避免新增第 5 个头部操作。
8. **公网 API 绕过 Vite 代理**：Cloudflare Named Tunnel 对 `/api/*` 直接回源 Spring `18080`，其余页面、Loader 和 SDK 静态产物继续回源 Vite `5173`。这使 WebSocket Upgrade、SSE、Ajax 和附件请求只经过一层应用代理，避免 Cloudflare 与 Vite 的二次 Upgrade 链路。
9. **登录前复用同一连接设置**：Forge 登录表单展示当前有效请求域，并复用 `AssistantConnectionSettings.apply` 执行用户覆盖。地址变化时先保存并重新载入，再由新实例统一派生登录与 WebSocket 客户端；地址未变化时直接认证，避免维护第二套运行中连接重建逻辑。

## Risks / Trade-offs

- [HTTPS 宿主指向 HTTP 内网 IP 会被浏览器拦截] → 文档明确要求协议安全级别一致，错误由现有可恢复连接状态呈现。
- [内网 IP 未加入 CORS/Origin 白名单] → 接入文档将“宿主 Origin”与“Forge 请求域”分开说明。
- [多次 Loader.load 使用不同请求域] → 每次返回独立门面，但 SDK 现有页面级单例约束仍保持，一个页面只启动一个实例。
- [用户覆盖导致跨域失败] → 保存前拒绝非法协议、凭据和 HTTPS 页面指向 HTTP 请求域；失败时保留输入并给出恢复动作。
- [本地配置过期] → 设置面板始终提供“恢复默认”，清除当前 `appId` 的覆盖后重新载入。
- [Spring 本地端口变更] → Named Tunnel 脚本集中生成 API 回源规则；发布前使用 `cloudflared tunnel ingress validate` 验证配置，回滚时恢复备份的单回源配置。
- [用户在填写密码后才修改地址] → 地址操作明确标注“应用并重新连接”，页面重新载入前不提交密码，登录失败信息与连接地址错误分区显示。

## Migration Plan

1. 先发布兼容旧 `wsUrl/loginUrl` 的 SDK 新版本。
2. Loader stable 渠道指向新版本后，新接入项目可改用 `requestBaseUrl`。
3. 回滚时恢复 stable manifest，旧宿主配置不受影响。

## Open Questions

无。
