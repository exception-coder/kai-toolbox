# Forge Quality Gate 编码摘要

## 1. 模块坐标

```text
forge-quality/
├── forge-quality-core/
├── forge-quality-plugin-java/
├── forge-quality-runtime/
├── forge-quality-application/
├── forge-quality-cli/
└── forge-quality-mcp/
```

## 2. 关键类型

| 模块 | 类型 | 责任 |
|---|---|---|
| core | `QualityPlugin` | 插件 SPI |
| core | `StackDetector` | 技术栈证据探测 SPI |
| core | `QualityChecker` | 检查器 SPI |
| core | `QualityEngine` | 插件加载、路由、异常隔离和汇总 |
| plugin-java | `JavaStackDetector` | Maven 与源码证据识别 |
| plugin-java | `MyBatisParameterBindingChecker` | `MYBATIS-001` |
| runtime | `RuntimeVerificationEngine` | 场景路由、异常隔离和运行结果汇总 |
| runtime | `SqlRuntimeVerifier` | JDBC 只读 SQL 真实执行 |
| runtime | `ApiRuntimeVerifier` | HTTP 请求、状态与 JSON 断言 |
| application | `ForgeVerificationService` | 双阶段用例编排与统一报告 |
| cli | `ForgeQualityCli` | 命令解析、文本/JSON 适配与退出码 |
| mcp | `ForgeVerifyTool` | 单一 `forge_verify` 工具契约与结构化结果 |
| mcp | `ForgeQualityMcpServer` | stdio MCP 生命周期 |

## 3. 关键约束

- Core 包名不得出现具体框架名。
- Checker 不直接打印输出，统一返回 `Finding`。
- 插件发现使用 `ServiceLoader`，测试允许显式注入插件。
- 输出字段使用封闭枚举；Agent 输出按不可信消费者契约保持确定性。
- 所有路径在报告中归一化为 `/` 分隔的相对路径。
- Static 失败时不得调用任何 Runtime Verifier。
- Runtime 配置不得保存密码、Token 或完整敏感响应。
- MCP 标准输出不得写日志；质量失败返回 `status=FAILED`，不设置 `isError=true`。
- CLI 与 MCP 不得复制验证编排或 Checker 业务规则。

## 4. 首批规则限制

`MYBATIS-001` 首批只验证 Mapper XML 占位符的根参数名，不声称完成 Java 类型系统或 OGNL 全语义验证。无法可靠解析的表达式返回 `WARNING`，明确证据和限制；确定缺失的参数返回 `ERROR`。

Runtime SQL 首批不支持 DML、存储过程或多语句脚本；API 首批验证状态码与 JSON 路径存在性，不替代完整业务断言。

## 5. 验证命令

```powershell
mvn -pl forge-quality/forge-quality-cli -am test
mvn -pl forge-quality/forge-quality-mcp -am package
java -jar forge-quality/forge-quality-cli/target/forge-quality-cli.jar verify static --project . --format json
```

注册本地 stdio Server：

```powershell
codex mcp add forge-quality -- java -jar D:/path/to/forge-quality-mcp.jar
claude mcp add --scope project forge-quality -- java -jar D:/path/to/forge-quality-mcp.jar
```
