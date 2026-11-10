## Context

Vite `/api` 代理已把浏览器原始 Host 和 scheme 写入 `X-Forwarded-Host`、`X-Forwarded-Proto`。浏览器从 `https://192.168.x.x:5173` 打开工作台时，Spring 收到的连接来自本机代理，但 CORS 仍按浏览器 Origin 校验；动态局域网地址不在 `TOOLBOX_AUTH_EXTERNAL_LOGIN_ALLOWED_ORIGINS` 中，因此附件预检返回 `Invalid CORS request` 403。

## Goals / Non-Goals

**Goals**

- 恢复移动端通过局域网工作台选择、粘贴图片后的附件上传。
- 只信任本机回环代理声明的原始同源地址。
- 不改变登录、会话归属和附件存储校验。

**Non-Goals**

- 不允许任意局域网或通配符 Origin。
- 不改变外部系统接入的显式 Origin 白名单。
- 不新增附件接口或持久化结构。

## Decisions

### 基于可信代理的逐请求 CORS 配置

附件 CORS 配置源在每次请求中合并静态白名单与一个可选的代理同源 Origin。仅当请求的远端地址为 loopback，且 `Origin` 精确等于 `X-Forwarded-Proto + X-Forwarded-Host` 时才加入允许列表。外部登录仍只使用静态白名单，避免代理规则扩大凭据入口。

### 不按私网网段使用通配符

IP 会变化，但 `http://192.168.*:*` 一类模式会允许同网段任意站点发起跨域请求。代理同源证明复用浏览器实际访问地址，范围更窄，也与现有 Vite 转发契约一致。

## Risks / Trade-offs

- 自定义代理若未传递两个转发头，仍会 403；显式配置 Origin 是兼容回退。
- 应用若未来直接信任非回环反向代理，需要单独设计可信代理清单，不能隐式扩大本规则。

## Verification

- MockMvc 验证局域网 Origin 经回环代理通过附件预检。
- 验证非回环来源和 Origin/转发头不一致继续返回 403。
- 运行 `toolbox-common` 定向测试、OpenSpec strict validation 和 Forge Quality Gate。

## Rollback

回滚动态 CORS 配置源即可恢复仅静态白名单行为；接口与数据均无需迁移。
