# Wyoooni 工程规范

本目录是 Wyoooni 工程约束的唯一事实源。Codex、Claude Code和人工开发者使用同一套规则，不维护Agent专属副本。

## 必读文档

1. [`architecture.md`](architecture.md)：模块边界、依赖方向和数据架构。
2. [`coding-standards.md`](coding-standards.md)：Java、Lombok、MapStruct、配置和安全规范。
3. [`testing-and-quality.md`](testing-and-quality.md)：测试命令与交付门禁。

## 维护原则

- 规则描述稳定约束，不记录某次会话过程。
- 新规则优先补充现有文档；只有形成独立主题时才新增文件。
- 能用编译、测试或静态检查执行的规则，不应只依赖文字提醒。
- 规范变化必须同步更新本索引，禁止在 `AGENTS.md` 和 `CLAUDE.md` 复制正文。
