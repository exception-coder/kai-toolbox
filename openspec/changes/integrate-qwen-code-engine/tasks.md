## 1. Dependency and adapter

- [x] 1.1 Pin compatible `@qwen-code/sdk` and current `@openai/codex-sdk` versions in the Sidecar lockfile
- [x] 1.2 Implement a focused Qwen SDK adapter for session resume, permissions, streaming events, interruption and recoverable errors
- [x] 1.3 Register Qwen in the unified engine contract and add adapter-level regression tests

## 2. Cross-layer integration

- [x] 2.1 Accept and persist the Qwen engine identity in Java and launch-intent boundaries
- [x] 2.2 Add Qwen to the existing engine selector, status, icon and SDK version management UI
- [x] 2.3 Add Qwen to Sidecar SDK version discovery and verified upgrade routing

## 3. Documentation and verification

- [x] 3.1 Synchronize AI coding architecture and current multi-engine design boundaries
- [x] 3.2 Run Sidecar source compilation/tests, frontend checks, backend tests and OpenSpec strict validation
- [x] 3.3 Run the Forge quality gate and commit only the verified change files
- [ ] 3.4 After explicit restart authorization, publish the protected Sidecar `dist` and complete runtime acceptance
- [x] 3.5 修复目录回退时 Antigravity 在切换菜单中无状态消失：打开菜单刷新目录，缺席时提供检测状态与重试；前端 TypeScript、构建、OpenSpec 与 Forge 门禁通过。
- [ ] 3.6 在浏览器中确认切换菜单能从目录回退恢复到 Antigravity 可选项；仅靠实时目录接口不能证明页面交互结果。

## 4. Qwen Code 认证与模型设置

- [x] 4.1 用 SDK 自带 CLI 复现无认证错误，区分千问办公与 Qwen Code 的认证边界。
- [x] 4.2 Sidecar 回报可恢复认证错误并通过 SDK 获取当前账号模型；切换引擎时清理跨引擎模型 ID。
- [x] 4.3 会话配置提供 Qwen Code 模型选择与刷新，目录缺失时显示认证恢复提示。
- [x] 4.4 完成专项测试、前后端构建、OpenSpec/Forge 门禁。
- [ ] 4.5 运行版本及真实 Qwen 对话待本次变更的明确重启授权和认证配置。
