# 任务

- [x] 在移动端运行面板加入正在执行与最近会话快捷入口。
- [x] 复用现有会话切换，补充组件回归测试。
- [x] 前端类型检查与组件测试通过。
- [x] Forge 质量门禁执行并核对实际覆盖范围。
- [ ] 完成目标版本移动端浏览器验收。

## 验证记录

- 组件回归：`MobileSessionStatus.test.tsx` 11/11 通过，覆盖正在执行优先、最近会话与切换提示。
- 前端：`npm run typecheck`、`npm run build` 通过；OpenSpec strict 校验通过。
- Forge CLI `verify`：`status=PASSED`，Static 和 Runtime 均为 PASSED；`executedCheckers=[]`，Runtime 执行 9 个 `API-RUNTIME-001` 现有 API 场景。这些场景不验证新移动端界面。
- `node forge.mjs status` 确认前端受管服务在线且重启次数为 0；启动脚本表明 dev 模式使用 Vite 热更新，本次无需重启。
- 浏览器访问 `https://localhost:5173` 被自动安全策略拒绝，不能改用其他浏览器或底层命令绕过；目标页面的视觉和切换验收仍待完成。
