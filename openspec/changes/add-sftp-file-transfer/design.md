# 设计与边界

## 交互

适用原则：OBJ-01（主机行内操作）、NAV-01（复用主机管理入口）、CTX-01（主机与目录上下文）、FEED-01（连接/失败/备份反馈）、CTRL-01（显式准备替换）、EVID-01（结果与验收分开）。桌面采用目录工具条、可滚动文件表、上传区；移动端工具条换行、文件表横向滚动，Dialog 自身纵向滚动。面板关闭与面板内目录导航在传输中禁用，失败保留选择以便核对。无原则例外。

## 实现

文件能力归 tool-hosts；复用 HostsService 与 HostSshSessions，独立 openVerified 严格核对服务账号 ~/.ssh/known_hosts。已有 SSH 调用策略不扩散到新 SFTP。JSch 官方依据：https://github.com/mwiede/jsch/wiki/Jsch-Configuration 。账号只使用原主机存储，禁止凭据进入版本库、错误响应和操作日志。API 使用 RequireRole ADMIN。

路径由服务端 pwd 返回，不使用 Forge 所在操作系统解析远端路径。Windows 输入反斜杠转为斜杠；实际盘符/根目录依服务端实现，不能承诺任意 Windows 路径均可访问。拒绝控制字符和 JSch 通配符；不对链接执行下载或替换。单次目录最多 1000 项，普通文件最多 20 MiB；连接/读写超时15/30秒，不执行 shell。

上传新文件不允许已存在目标。替换必须携带下载时获得的 SHA-256；暂存上传后核对摘要，再次核对原文件、复制普通rwx权限（不复制特殊权限位、所有者、ACL或时间戳）、原文件改名备份、暂存改名目标。失败尝试恢复备份；临时文件清理失败、恢复失败保留操作编号日志。备份默认保留，不自动删除。

SFTP 多次操作不是事务，外部程序仍可能在摘要核对与改名之间修改文件；应在部署窗口停止并发写入。远端 Windows 文件占用、改名与 chmod 支持由服务器决定；拒绝操作时保持失败，不回退为直接覆盖。网络中断可能使结果不明，必须先刷新核对目标、备份和临时文件，不盲目重试。恢复备份通过再次确认摘要上传，不提供自动远程删除。

## API 与扩展

GET /api/hosts/{id}/files?path=...；GET /download?path=... 返回二进制及 X-Content-SHA256；POST multipart directory/name/file/expectedSha256。HTTP API 是同一能力边界；本次未登记专用 Agent MCP 文件传输工具，也未新增系统资源 provider。

ERP 连接为 wftp.wyoooni.net:2322（SFTP）；不能把用户提供的 http:// 前缀用于 SSH。账号、密码不写入本文。真实连接、主机指纹信任与生产文件替换尚未执行。没有数据库迁移，没有修改 AI 编程架构的上下文、监督或交付契约。
