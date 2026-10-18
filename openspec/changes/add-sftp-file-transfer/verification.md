# 验证记录（2026-10-18）

## 已验证

- Java 21：`mvn -pl tools/tool-hosts -am clean test -Dtest=SftpFilesTest -Dsurefire.failIfNoSpecifiedTests=false`，退出0，7项通过。覆盖未确认覆盖拒绝、新增文件、备份替换顺序、最终改名失败恢复、部分上传失败清理、Windows路径与通配符拒绝、链接/超限拒绝。均为模拟 SFTP 回归，不是实机证明。
- 前端：`npx vitest run src/features/hosts/files/HostFiles.test.tsx`，退出0，3项通过；覆盖摘要确认（含准备目标时清除旧本地文件）、切目录清除替换授权、失败保留目标。
- `npm run typecheck`，退出0；菜单目录59项一致，Feature边界无新增违规。
- `scripts/forge-quality.ps1 verify -Project . -Format json`，退出0、JSON `status=PASSED`。`executedCheckers=[]`（没有执行静态检查器）；9项既有 HTTP 用例通过，均不包含新 SFTP API，不能视作本功能上线验收。
- `openspec validate add-sftp-file-transfer --strict`，退出0，规格有效。
- `git diff --check` 本次范围通过。Hosts新增组件仅依赖原有公共组件、API、TanStack Query和Radix，没有使用其他任务的咨询改动。更新纸条只追加一条数据，不依赖正在修改的咨询交互。

## 构建

`mvn -pl toolbox-starter -am package -Dmaven.test.skip=true` 退出0，41模块 BUILD SUCCESS；内置 `npm run build` 含 TypeScript 编译与 Vite 生产构建通过（6387模块，2117静态资源入包）。本命令不执行全量Java测试，专项7项测试另行通过。包内SftpFiles、SftpFilesController、HostSshSessions三个类与编译输出一致，内嵌HostsPage产物与最新frontend/dist完全一致。验证期间曾误并行执行共享 target 的 Maven 命令，出现类缺失；已停止本次重复构建并串行 clean test，失败及被停止命令不计成功证据。宿主 POM 自带前端生产构建与静态资源入包，发现后已停止重复的独立前端构建，以宿主构建为最终结果。

整仓构建读取当前工作树，包含作业开始前已有的咨询界面改动；本次提交仅包含 SFTP 范围。构建结果不等同于“仅此提交”的发布制品，运行前须按批准的发布范围生成隔离制品或确认完整工作树范围。本文没有授权部署其他任务改动。

## 待运行验收

- 未重启 Forge 后端，新增接口未做运行验收；按 AGENTS.md，本次重启需用户明确确认。
- 浏览器工具两次打开验证标签页均超时；桌面与移动视觉、真实文件下载/上传尚未通过浏览器验收。
- 未登记或使用用户提供的 ERP 密码，未进行 ERP SFTP 认证或文件操作，也未替换任何真实服务器文件。待核对主机密钥、登记账号，再执行只读连接验收；真实替换须指定目标。
- Linux/Windows 的服务器路径、权限与改名行为尚未实机验证。普通FTP/FTPS、超过20MiB的文件、专用Agent MCP工具均未实现。
- 本次没有数据库迁移或人工待执行SQL。没有改变AI上下文、监督或交付架构契约。

## ERP 只读探测

`ssh-keyscan -p 2322 -T 5 wftp.wyoooni.net` 返回 RSA 1024 位公钥，指纹 `SHA256:U7gTHqAEWWcc9s4RaafFus7Ijsdvqbd/3IS8Juih3ys`。仅为网络返回值，不是可信身份证明；没有加入 known_hosts、没有发送密码、没有绕过算法或密钥验证。需要运维通过可信渠道核对该指纹，并评估服务器密钥升级。
