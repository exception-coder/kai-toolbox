# 实施与验收

- [x] 记录Git基线，保留已有未跟踪测试目录；核对读取、MCP与导出链路。
- [x] 复用签名入口及附件身份检查，补齐POI SAX工作表目录与独立行游标。
- [x] 定义值/缓存语义、安全限制和明确失败恢复，不开放宿主终端。
- [x] 同步后端、MCP、设计器的Excel输出容量与架构正文/流程图。
- [x] 执行附件/控制器/导出与Sidecar定向回归、Java21宿主装配编译和质量门禁。
- [x] 复核diff与提交边界，验收记录随实现提交；实际提交号以Git为准。

## 本地证据（2026-10-16）

- Java21 `mvn -pl toolbox-starter -am test-compile -DskipTests -q`退出0，验证新增POI依赖及宿主装配；随后受影响模块定向测试再次编译最终读取器实现。
- `mvn -pl tools/tool-claude-chat,tools/tool-fore-consult -am test`，用`-Dtest`选择8个套件：35项，失败/错误/跳过均0。覆盖真实XLSX多表、稀疏行列、中文前导零、长单号、1900/1904日期、公式缓存及缺失值、外链公式仅作文本、响应分页、损坏/ZIP超限/路径越界/动态字节限制、签名接口、2218行导出下载、文档配额/隔离、数据库绑定权限。既有Mockito动态agent警告不影响本次退出0。
- Sidecar全量TypeScript编译退出0；5个定向套件16项通过（首轮15项通过，新增大中文请求测试的HTTP夹具UTF-8分块解码修正后单独复跑1项通过）。涵盖真实stdio工具列表与签名转发、两引擎装配/权限、行分页、未截断JSON、超过旧30万字符的导出及设计器隔离/超时/内存保护。
- `npm run typecheck`通过，包含菜单目录和Feature boundaries检查；管理员配置与动态附件策略前端4项通过。前端仅说明文案变更，不新增布局或浏览器导航。
- `openspec validate consult-xlsx-attachment --strict`通过；变更的架构Mermaid使用项目mermaid及JSDOM解析通过，不冒称视觉渲染验收。
- Forge CLI完整门禁JSON `PASSED`、退出0；`executedCheckers=[]`，不能声称额外静态checker已执行。9项HTTP验收针对既有运行版本，不证明本次XLSX版本已上线。
- `node forge.mjs status`确认本地原后端/前端/微信/Studio仍ready、重启次数0。未重启或部署，未修改数据库实际配置。

运行验收待办（不冒称已通过）：用户原始“款号库存”文件总行数/业务列；正式流程v5的实际DEV库只读匹配、最早日期并列及未匹配结果；Claude/Codex图片输入与Excel下载端到端。需同事部署本次代码并取得当次重启确认后执行状态、日志、HTTP和至少60秒稳定观察。
