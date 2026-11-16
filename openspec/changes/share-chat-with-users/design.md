# 设计与权限边界

- L3：新增对象级权限。分享关系归 tool-claude-chat；共用 AuthUserRepository 的最小用户目录投影，不复制用户身份。
- 仅拥有者或 ADMIN 且通过现有项目可见性校验者可搜索接收者、查看授权名单、添加与撤销。未启用认证时不开放具名共享；接收者须为有效账号。
- 独立只读 Controller 每次请求复核账号、会话、项目可见性与授权。原 canAccess、WebSocket 和所有写接口不变。共享链接只定位对象，不授予权限。撤销影响后续读取，无法收回对方已读文字。
- 新表 claude_chat_session_reader 以 (session_id, user_id) 唯一，外键级联清理会话；最多 50 个接收者。目录搜索最少两字、最多 20 个；共享列表最多 100 个，使用批量会话读取，不逐条查询历史。
- 只投影 title / engine / 用户与助手文字及时间，不返回目录、SDK 句柄、Key、工具日志和附件路径。共享内容可能本身含敏感文字，授权面板明确提示。复用当前原生会话的历史分页，不触发引擎、不读取任意客户端路径；未落盘内容和其他引擎段不宣称完整覆盖。
- 移动端复用 Sheet；入口放当前会话“更多→会话→共享给用户”，另有同模块“共享给我”列表；只读页面无输入框和执行按钮，手动刷新重新验证权限。失权或请求失败时清除已展示内容并提供返回入口。
- 适用原则 OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、AI-01；无例外。弹层关闭由 Radix 恢复焦点，搜索/保存反馈独立。
- 依据：[OWASP 授权建议](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：默认拒绝并在每次请求校验。无需引入外部 ACL 服务。
- prepare_sql_context 核验结果为 DDL_MISSING（evidenceId: 7629717e-b8af-4787-ae71-2895c8b855ce）：项目 SQL 扫描达到上限，三张目标表均未核验。资源发现中 Forge 系统没有绑定可查资源。DDL 以本仓 SQLite schema 为基线，仅交付幂等迁移，并用内存 SQLite 验证唯一性、上限和级联清理；未核验运行库，不直接写运行库、不重启服务。
