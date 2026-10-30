# Forge 日常需求模板

本项目默认 schema 为 `forge-lite`，从 OpenSpec 1.15.0 的官方 `spec-driven` 分叉。按需要保留官方产物身份、增量格式和任务勾选协议，不复制 CLI 的校验、同步或归档实现。

使用 CLI 1.15.0 或另行验证兼容的版本，尤其不要假定旧版支持 `skip_specs`；本机已升级，其他开发机须分别检查安装版本。

## 如何调整大纲

| 配置位置 | 控制内容 |
|---|---|
| `openspec/config.yaml` 的 `schema` | 新 Change 默认使用哪个工作流 |
| 本目录 `schema.yaml` | 产物、依赖、生成说明和 apply 指令 |
| 本目录 `templates/*.md` | 实际文档大纲；修改后下次生成使用 |
| `openspec/config.yaml` 的 `context/rules` | 项目通用约束和附加要求，不替换大纲 |
| Change 的 `.openspec.yaml` | 该 Change 固定的 schema；无行为变化时可声明 `skip_specs: true` |

模板改动不重写已经存在的文档。CLI 升级和 `openspec update` 也不覆盖本目录；后续采纳官方改进须比较并更新此 fork。

## 默认文档

| 文件 | 最小大纲 |
|---|---|
| `proposal.md` | Why：问题与结果；What Changes：变化和影响；Capabilities：受影响能力 |
| `specs/<capability-path>/spec.md` | 本次实际增量类型、Requirement、必要 WHEN/THEN 场景 |
| `tasks.md` | 一个或少量功能组、编号勾选任务及完成依据 |
| `design.md`（按需） | 实现与边界；风险与验证。需要迁移等内容时只补相关部分 |

日常需求不设最低篇幅，不机械补齐模板中所有能力分组、增量类型或示例数量。规格只描述变化，不重写完整模块。Scenario 是验收义务，不是新测试数量；优先复用已有检查与有效证据。

design 不在强制 artifact 链中。发生架构/跨模块契约、新依赖或重要数据模型、安全/性能/迁移风险、关键技术歧义时，先使用 `templates/design.md` 补充当前 Change 的 `design.md`，或引用准确且覆盖本次变化的现有设计。UI/AI 工作流还需满足产品哲学的设计要求。tasks 和 apply 指令保留该判断并要求读取已有设计；CLI 不代替 Agent 判断设计是否充分。

行为保持的小修复不为流程单独建 Change。无行为变化但确需跟踪的工具、文档或重构可使用 `skip_specs: true`，此时 proposal 和 tasks 仍保留；真实行为变化不能用它绕过规格。

## 使用与检查

```powershell
openspec new change <name> --json
openspec status --change <name> --json
openspec instructions proposal --change <name> --json
openspec instructions apply --change <name> --json
openspec schema validate forge-lite --json
openspec validate <name> --strict --json --no-interactive
```

需要官方完整产物链时可显式创建 `openspec new change <name> --schema spec-driven --json`，但仍按实际影响写正文。旧 Change 继续使用元数据中记录的 schema，不随项目默认切换；没有元数据的旧活动 Change 已补一行旧 schema 绑定，不修改正文或推定创建日期。

参考：[官方 schema 定制](https://openspec.dev/docs/customize-schemas)、[项目配置](https://openspec.dev/docs/project-config)。本次 CLI 命令契约以实际安装的 1.15.0 验证。
