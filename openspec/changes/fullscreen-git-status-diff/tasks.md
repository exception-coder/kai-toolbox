## Development

- [x] 1.1 实现共享待提交窗口的全屏/还原、Esc 和焦点恢复，保留原有 Git 读取逻辑。
- [x] 1.2 完成定向测试、typecheck、规格与项目门禁，记录浏览器验证结果。

验证：GitStatusPanel 7 项用例通过；frontend typecheck（含菜单目录与 Feature boundaries）退出 0，最终弹层改动另经定向 TypeScript 检查退出 0。OpenSpec strict 通过。Forge JSON status=PASSED、exit=0；executedCheckers 为空，仅实际执行 9 个既有 API-RUNTIME-001 场景，不代表本 UI 专项验收。

本地 Chrome `https://localhost:5173/tools/claude-chat` 已实际打开待提交文件、加载双栏差异，验证全屏铺满 1440×770 应用视口、Esc 还原、再次 Esc 关闭。截图保存在本地 `.git/fullscreen-git-diff.png`，不进入提交。菜单项卸载后的焦点回到持久入口由定向用例覆盖；浏览器连接出现间歇超时，未完成移动端和额外窗口尺寸实测，不将其标为通过。无后端改动、服务重启或生产发布。

## Production

- [ ] 2.1 [MANUAL_PRODUCTION] 发布到其他同事使用的环境并确认目标版本，无自动推送或重启。
