# Tasks

- [x] Node 固定/临时隧道入口与 PM2 管理，不修改远端资源。
- [x] 跨平台资产选择与参数边界专项测试。
- [x] 公网业务验收及至少 60 秒稳定观察。

2026-10-03 验证：Node 运行库 21 项测试通过（含 3 项隧道参数边界测试）；Forge CLI quality JSON status/staticStatus/runtimeStatus 均 PASSED、exit 0，executedCheckers 为空（未执行静态检查器），9 个 API-RUNTIME-001 场景通过。

公网故障证据与修正：原域名缺少解析，Clash fake-IP 和全局代理令边缘 TLS EOF；用户授权后仅增加 Tunnel DNS 排除及两个边缘网段的 TUN 绕行。旧隧道与域名账号不同，导致 HTTP 530/1033；用户授权在当前账号新建隧道并定向切换，旧凭据及配置备份保留。域名区域已激活，CNAME 指向新隧道；远程路由按 API、前端顺序下发，前端使用本机 CA 保留 TLS 验证。网络配置、凭据及运行日志均留在本机，不纳入仓库。

公网验收：`https://kai-tool.exception-coder.com/` 实际浏览器加载 Forge 页面，API 返回 34 项工具的有效 JSON，前端入口资源返回 200。从 13:20:41Z 起超过 60 秒连续采样，隧道 PID 46908、restarts 0、ready 200，页面/API/入口资源均 200；当次日志有 4 条 Registered tunnel connection，修正后没有连接错误。原业务服务未重启，PID 与重启次数保持不变。本机 `.kai-toolbox/cloudflared/public-stability.json` 保存采样。此次属于公网交付，不计入开机故障恢复轮次。
