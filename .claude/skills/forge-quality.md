# Forge Quality Gate

在完成源码修改后或用户要求代码质量检查时，优先调用 MCP `forge_verify`：

```json
{"project":"项目绝对路径","phase":"all"}
```

MCP 不可用时回退到 CLI：

```powershell
./scripts/forge-quality.ps1 verify -Project . -Format json
```

默认验证先跑 Static，只有通过才执行 `.forge/verify.yml` 中的 Runtime 场景。以结构化 `status` 为准；CLI 同时检查进程退出码。不要声称未执行的 Checker 或 Verifier 已通过。
