## Development

- [x] 1.1 队列置顶并独立滚动，功能与会话切换优先，诊断后置；复用原队列回调。
- [x] 1.2 完成定向回归、typecheck、规格和项目门禁，记录实际浏览器验证范围。

验证记录：

- `MobileAgentDock.test.tsx` 与 `MobileSessionStatus.test.tsx` 共 19 项通过；覆盖长会话列表、空队列、暂停队列、打开不发送及原发送/移除/清空回调。
- `npm run typecheck` 通过，Feature boundaries 与菜单目录检查通过。
- `openspec validate prioritize-agent-dock-actions --strict` 通过。
- 项目质量门禁退出码 0、JSON `status=PASSED`；实际执行 9 项已有 API 运行探测，无静态 checker。前端静态验证由上述 typecheck 和定向测试补齐。
- 本地 Vite 页面实测桌面 1440×770 与手机视口 390×844：队列位于标题下方，功能操作与会话切换在监控前；滚动下方区域时队列仍可见。桌面滚动位置实测 413px。当前真实队列为空，非空队列回调通过组件测试验证，未发送、移除或清空真实消息。
- 浏览器检查后已恢复原视口并关闭面板；未重启、推送或发布。其他同事环境仍待运行验收。

## Production

- [ ] 2.1 [MANUAL_PRODUCTION] 在其他同事使用的环境加载并验收目标版本；不自动推送或重启。
