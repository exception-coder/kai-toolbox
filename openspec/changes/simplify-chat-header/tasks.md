## 1. Implementation

- [x] 1.1 Remove duplicate site header UI and its unused helpers.
- [x] 1.2 Fix header width ownership and responsive information priority.

## 2. Verification

- [x] 2.1 Run type checks and relevant component tests.
- [x] 2.2 Run Forge quality gate and record actual executed checks.
- [ ] 2.3 Inspect desktop and mobile browser layouts and site navigation.

## Evidence

- frontend typecheck 退出 0，菜单目录及 Feature boundary 校验通过。
- SessionToolsMenu: 2 tests passed。
- Forge: PASSED，退出 0；executedCheckers=[]，executedVerifiers=[API-RUNTIME-001]，HTTP 200。
- Chromium MOCK 空会话：1440/1024/768/390 宽度均无 header overflow/overlap，长标题截断、菜单打开及 Escape 关闭通过。截图位于 outputs/chat-header/。真实已登录会话导航未验收。
- 隔离 Chromium 挂载真实 SessionSitesWorkspace，模拟站点数据；复制动作写入的 URL 与输入一致，退出 0。完整已登录会话导航仍待验收，2.3 保持未勾选。
