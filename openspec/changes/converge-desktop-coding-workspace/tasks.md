# 实施与验证

- [x] 共用执行 Dock，底部只常驻摘要与输入；诊断、记录、队列和指标按需展示。
- [x] 语音空闲隐藏且组件持续挂载，活跃 / 恢复状态可操作。
- [x] 桌面默认排队，菜单 / 快捷键补充，保留手机发送选择和输入法行为。
- [x] 定向行为检查、typecheck、独立前端构建与质量门禁。
- [x] 浏览器核对常规 / 短屏桌面与手机，记录实际布局与交互证据。
- [x] 本地原子提交；不推送、不自行重启服务。
- [ ] 新版实际会话页面验收；如需重启，等待本次明确授权，不将隔离样例当作真实会话运行通过。

## 本次证据（2026-10-13）

- 复用 7 个既有 suite，最终 50 项定向用例通过：运行状态、执行详情 / 异常、主 ChatPage 快捷键、发送菜单、IME、语音生命周期 / 结束后焦点、配置入口与消息呈现。初次配置入口旧文案断言失败，按新交互更新后该 suite 4 项通过；最后焦点修正后的发送 / 语音 17 项重验通过，其余输入未变复用有效证据。
- `npm run typecheck` exit 0；59 个菜单目录匹配，Feature boundaries 无新增违规。`npx vite build --outDir dist/desktop-dock-build` exit 0，保留现有大 chunk 警告，不触发 assistant 发布或服务启动。
- `openspec validate converge-desktop-coding-workspace --strict` 通过。Forge CLI 全阶段 exit 0，JSON `status=PASSED`；静态 `executedCheckers=0`，运行 9 项既有 HTTP 探测。它们不证明本次前端版本的真实会话行为。
- Edge 使用真实 MessageList、Agent Dock、ComposerTextarea、SessionConfigSheet 和发送组件的隔离 API 样例。桌面保留 32px 模拟监督栏：1440×900 对话区 663px（73.7%）、Dock 36px、Composer 96px；1280×600 为 363px（60.5%），短屏不承诺 70%。手机 390×844 对话区 611px（72.4%）、Dock 44px、Composer 96px。三种视口无水平或 body 纵向溢出，消息列表拥有滚动。
- 浏览器展开详情可查工具 / 文件 / 命令、队列与记录；记录不可用刷新为可用，关闭回摘要。桌面发送菜单排队一次，手机发送抽屉保留。焦点回 Dock / 输入、权限与语音生命周期由对应定向测试核对；没有发送真实消息或申请麦克风权限。
- 原始日志位于 `.git/desktop-dock-*.log`；截图为 `frontend/dist/desktop-dock-evidence/desktop-final.png` 与 `mobile-final.png`，均为本地忽略产物，不进入提交。
