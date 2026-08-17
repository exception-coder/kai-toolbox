# Forge

**The Workspace for Vibe Coding.**

Forge 是一个运行在本机的 AI Coding 工作台。它把项目目录、业务上下文、Agent、模型、权限、会话和工具收拢到同一个浏览器界面中，让需求沟通、代码定位、修改、验证与后续续接都围绕同一条会话链路完成。

当前 README 重点介绍项目初始化、启动方式和 **Vibe Coding** 模块。其他工具模块将在后续版本中补充说明。

## 快速开始

### 环境要求

- Windows 10/11 + PowerShell 7（`pwsh`），或 macOS + Bash/Python 3
- JDK 21
- Maven 3.9+
- Node.js 20+ 与 npm
- Git

Claude、Codex、Antigravity、OpenCode 按实际使用情况完成各自的本机安装或账号授权。Forge 不替代模型厂商的登录流程，只复用本机已有凭据或会话中配置的第三方网关。

### 获取项目

```shell
git clone https://github.com/exception-coder/kai-toolbox.git
cd kai-toolbox
```

### 一键启动

在项目根目录执行：

Windows：

```powershell
pwsh -File scripts\run-supervised.ps1
```

macOS：

```bash
bash scripts/run-supervised-macos.sh
```

首次启动时，脚本会：

1. 检查 Maven、JDK 21 和 npm。
2. 找不到工具时提示输入可执行文件或安装目录。
3. 安装或更新前端依赖。
4. 安装并构建 Vibe Coding 使用的 Claude Agent sidecar。
5. 启动 Spring Boot 后端和 Vite 前端，并持续守护进程。

启动完成后访问：

- 工作台：`http://localhost:5173`
- 后端 API：`http://localhost:18080`
- Supervisor 控制端点：`http://127.0.0.1:18081`

保持启动脚本所在终端运行。默认不开启源码热重启，修改后端代码后可使用页面中的重启入口，或重新启动脚本。

Windows 需要保存即编译并热重启时，显式执行：

```powershell
pwsh -File scripts\run-supervised.ps1 -HotReload
```

Windows 需要先完整打包再运行 fat jar 时：

```powershell
pwsh -File scripts\run-supervised.ps1 -Mode full
```

### 自动同步云端版本

源码自动更新现在由 Java 内置调度，默认跟随当前仓库的 `origin/main`；不论从 IDE、Maven、fat jar 还是 supervisor 启动，都会执行同一套安全检查。supervisor 只负责更新落地后的全栈重载，不再重复轮询 Git。

下面两个兼容启动参数仍然有效，会把自动更新配置传给 Java：

Windows：

```powershell
pwsh -File scripts\run-supervised.ps1 -AutoUpdate
```

macOS：

```bash
bash scripts/run-supervised-macos.sh --auto-update
```

当前仓库近 24 小时约 15 次提交、更新批次中位间隔约 21 分钟，因此默认每 120 秒检查一次；检测到新提交后，还会等待远端 HEAD 连续稳定 120 秒，把短时间连续 push 合并成一次重启。要关闭可设置环境变量 `TOOLBOX_AUTO_UPDATE_ENABLED=false`；经 supervisor 启动时也可写入本机 `scripts\run-tools.conf`，其他参数见 `run-tools.conf.example`。

直接从 IDE、Maven 或 `java -jar` 启动时，Java 会在独立 worktree 完整构建候选 fat jar，再启动脱离原终端的 replacement JVM 接管；如果 fat jar 已被复制到 Git 仓库之外，需要用 `TOOLBOX_AUTO_UPDATE_REPOSITORY` 指向本机 checkout，否则只上报 `unavailable`，不会修改文件或退出进程。直接接管能在旧进程退出前验证候选 JVM 与握手协议，但真实端口、现有数据库和全部 Spring Bean 的最终启动仍发生在接管后；这类运行期失败会写入 `~/.kai-toolbox/restart-handoff` 日志，不承诺自动回滚数据库。

自动更新遵循以下保护规则：

- 仅接受当前跟踪分支的 fast-forward；工作树 dirty、本地 ahead/diverged 时延期，不会自动 stash、reset 或 clean。
- 会话回合、权限/提问、后台 Agent 或一次性分析仍在运行时延期；无法确认空闲也不会强制重启。
- Git fetch 有超时和指数退避；实际更新状态从 `GET /api/system/auto-update/status` 或 Spring 应用日志查看。supervisor 的 `GET http://127.0.0.1:18081/status` 只报告 `delegated-to-java` 和全栈重载接管能力。
- 同一仓库只允许一个 supervisor 实例，避免重复进程互相抢占端口。

### 停止服务

Windows：

```powershell
pwsh -File scripts\stop-supervised.ps1
```

macOS：

```bash
bash scripts/stop-supervised-macos.sh
```

全停但保留 AgentScope Studio：

Windows：

```powershell
pwsh -File scripts\stop-supervised.ps1 -KeepStudio
```

macOS：

```bash
bash scripts/stop-supervised-macos.sh --keep-studio
```

Windows `-Ports 18080,5173` / macOS `--ports 18080,5173` 只适合 supervisor 已经退出后的定点清理；若 watchdog 仍在运行，被停止的前后端会按设计重新拉起。

## 首次配置

### 本机工具路径

启动脚本会自动探测工具路径。需要显式配置时，创建受 Git 忽略的分类目录并复制所需模板：

```powershell
New-Item -ItemType Directory -Force scripts\run-tools.d
Copy-Item scripts\run-tools.example.d\*.example scripts\run-tools.d\
```

```bash
mkdir -p scripts/run-tools.d
cp scripts/run-tools.example.d/*.example scripts/run-tools.d/
```

按实际环境填写：

```properties
MVN_CMD=D:\devapps\apache-maven-3.9.9\bin\mvn.cmd
JAVA_CMD=D:\Java\jdk-21\bin\java.exe
NPM_CMD=D:\Program Files\nodejs\npm.cmd
```

建议去掉复制后文件名末尾的 `.example`，按运行工具、存储、安全、AI 服务、外部集成和供应商报价分别填写。
`scripts/run-tools.d/` 整个目录已被 Git 忽略。旧版 `run-tools.conf` 可执行
`scripts/migrate-run-tools-config.ps1` 自动迁移；不要把真实凭据写入示例文件或源码。

### Agent 授权

- **Claude**：使用本机 Claude/Anthropic 已有授权或会话中配置的第三方服务商档案。
- **Codex**：默认读取 `%USERPROFILE%\.codex`；自定义 `CODEX_HOME` 时，应先在对应目录完成 `codex login`。
- **Antigravity**：个人 Google Agent 场景使用本机 `agy` 登录与配置；Forge 会检测结构化输出能力，旧版 CLI 会提示升级。
- **OpenCode**：Provider、鉴权和默认模型由 OpenCode 自身配置管理。

建议先在各 Agent 的原生客户端确认可以正常发起一次请求，再进入 Forge 创建会话。这样可以把登录问题和 Forge 会话问题分开排查。

### 项目工作区

Vibe Coding 创建会话时需要一个工作目录。可在 `toolbox-starter/src/main/resources/application.yml` 的 `toolbox.claude-chat.workspace` 下配置工作区根目录：

```yaml
toolbox:
  claude-chat:
    workspace:
      roots:
        - "D:\\work\\projects"
      knowledge-base-dir: "D:\\work\\project-domain-knowledge\\knowledge"
```

- `roots`：项目选择器扫描的父目录，只扫描一级子目录。
- `knowledge-base-dir`：可选的业务知识库 `knowledge/` 目录，用于展示更准确的业务模块树。
- 未配置工作区时，新建会话仍可手工输入绝对路径。
- 会话的文件访问、命令执行和代码修改都以选定工作目录为边界起点。

知识库模块声明位于：

```text
{knowledge-base-dir}/{项目目录名}/impl/modules.json
```

项目目录名必须与知识库 project key 一致。模块可分别声明后端 `codePath` 和前端 `webPath`；从项目工作台按模块创建会话时，优先以 `webPath` 作为会话工作目录，缺省时回退到 `codePath`。

## 使用 Vibe Coding

启动后，在左侧菜单进入 **AI → Vibe Coding**，也可以直接访问：

```text
http://localhost:5173/tools/claude-chat
```

### 功能亮点

| 能力域 | 功能点 | 说明 |
|---|---|---|
| 多 Agent 编排 | 四种编码引擎 | 同一工作台接入 Claude、Codex、Antigravity 和 OpenCode，可按任务特点选择合适的 Agent。 |
| 多 Agent 编排 | 会话内切换与续接 | 保留各引擎的原生会话标识；切换 Agent 时同步增量上下文，可在同一业务会话中分工协作。 |
| 模型控制 | Codex 运行参数 | 当前会话可切换 Codex 模型、推理强度和标准/快速模式，配置从下一轮消息开始生效并自动保存。 |
| 模型控制 | Provider 档案 | 支持官方授权和第三方服务商档案，可维护网关、模型列表并快速切换。 |
| 模型控制 | 模型诊断 | 对比请求模型与服务端实际返回模型，辅助定位代理网关、模型映射和降级问题。 |
| 项目上下文 | 工作目录隔离 | 会话绑定具体项目或模块目录，使文件读取、代码修改和命令执行聚焦在明确边界内。 |
| 项目上下文 | 项目与 PRD 引用 | 输入时可通过 `@` 引用项目或 PRD，把业务背景和需求材料直接带入当前任务。 |
| 执行控制 | 引擎级权限模式 | 针对不同 Agent 提供请求批准、自动接受、计划和完全访问等权限档位。 |
| 执行控制 | 过程可视化 | 实时展示推理过程、工具调用、文件变更、子 Agent 活动和权限确认，不把执行过程藏在黑盒中。 |
| 执行控制 | 运行中消息排队 | Agent 执行期间仍可追加后续要求，消息进入队列并按顺序继续处理。 |
| 多模态输入 | 附件与图片预览 | 支持发送截图、日志、PRD 和普通文件；图片可在发送前预览和移除。 |
| 高效输入 | Slash 指令 | 通过 `/` 指令快速调用常用动作或切换模型，减少重复操作。 |
| 会话管理 | 最近会话与恢复 | 按最近活动快速找回任务，恢复对应工作目录、Agent、模型和历史上下文。 |
| 会话管理 | 搜索、别名与两级分组 | 可按别名搜索，并使用“系统/项目 → 需求 → 会话”结构归档大量开发任务。 |
| 会话管理 | 多会话分屏 | 同时打开多个 Agent 会话，对照实现、复核结果或并行推进不同任务。 |
| 沉浸交互 | 全屏与悬浮会话框 | 全屏模式隐藏工作台导航；悬浮会话框可在浏览其他模块时保持沟通上下文。 |
| 沉浸交互 | 语音与手势 | 支持语音输入、语音模式和手势交互，适合演示、移动操作和连续沟通。 |
| 个性化体验 | 炫彩皮肤 | 根据当前 Agent 呈现不同氛围，同时保持会话内容与操作行为一致。 |
| 工程协作 | 文件树与 Git 视图 | 在会话旁查看项目文件、变更差异和提交信息，便于确认 Agent 的实际改动范围。 |
| 需求闭环 | PRD 关联与变更分析 | 将开发会话关联到 PRD，分析代码实现对需求文档的影响并辅助回写。 |
| 数据库变更 | 待执行 SQL 管理 | 集中登记、查看和维护待审核 SQL，让数据库变更与开发会话一起留痕。 |
| 结果交付 | PDF / Word 导出 | 将完整会话导出为 PDF 或 Word，并保留消息中的图片，便于评审、归档和交付。 |

### 1. 创建会话

点击顶部或会话栏中的 **新建会话**，依次完成：

1. 选择工作区和项目，或手工输入工作目录。
2. 选择 Agent 引擎：Claude、Codex、Antigravity 或 OpenCode。
3. 根据引擎选择官方授权、第三方服务商档案和模型。
4. 确认后创建会话，在底部输入需求并发送。

工作目录应尽量落到本次需求对应的项目或模块，避免给 Agent 一个过大的扫描范围。需求描述建议包含目标、现象、约束和验收方式；截图、日志、PRD 和其他文件可直接作为附件发送。

### 2. 设置权限模式

输入区左侧的权限模式控制 Agent 可以执行到什么程度。不同引擎会显示各自支持的选项：

| 模式 | 适用场景 |
|---|---|
| 默认 / 请求批准 | 希望逐项确认高风险操作 |
| 自动接受 / 帮我批准 | 允许常规编辑，仅在检测到风险时询问 |
| 计划 | 只分析和输出实施方案，不直接修改代码 |
| 全自动 / 完全访问权限 | 已确认目标和边界，希望 Agent 连续完成修改与验证 |

首次处理陌生项目建议使用“计划”或默认模式；确认方案后再提升权限。全自动模式会扩大文件、命令和网络访问范围，只应在可信目录与明确任务中使用。

### 3. 切换 Agent 与模型

会话顶部显示当前 Agent。会话空闲时可以在 Claude、Codex、Antigravity、OpenCode 之间切换；Forge 会保存每个引擎对应的原生会话标识，并把目标引擎尚未看到的增量上下文同步过去，便于在同一业务会话中分工协作。

常见用法：

- Claude 负责需求理解、代码梳理和长上下文分析。
- Codex 负责实现、代码审查、命令执行和验证。
- Antigravity 使用 Google 账号和其模型目录，作为补充分析或第二视角。
- OpenCode 复用团队已有 Provider 与模型配置。

切换到 Codex 后，输入区会出现 Codex 配置入口，可在当前会话中修改：

- **模型**：从本机 Codex 模型清单选择。
- **推理强度**：根据模型能力选择低、中、高、超高等档位。
- **速度**：标准或快速；模型不支持快速档时会自动回退。

这些配置在下一轮消息生效，并持久化到当前会话。模型列表和可用推理档位以本机 Codex 实际返回为准。

### 4. 发送内容与跟进执行

输入区支持：

- 文本需求和多轮追问。
- 图片、日志、PRD 和普通文件附件。
- `/` 指令与模型快捷切换。
- 运行中的后续消息排队。
- 工具调用、文件修改和权限请求的可视化确认。
- 中断后恢复当前原生会话，或在历史损坏时于同目录新建干净会话。

Agent 执行期间会持续展示推理、工具调用、文件变更、子 Agent 活动和结果。完成后先检查变更文件与验证结果，再让 Agent 提交代码，避免把无关工作区改动一起提交。

## 管理与找回会话

### 最近会话

左侧的 **最近会话** 按最后活动时间展示常用会话。点击即可恢复对应工作目录、Agent、模型和历史上下文，适合继续前一天未完成的任务。

会话支持别名。建议使用“项目 + 需求 + 阶段”的方式命名，例如：

```text
ERP / 纱线询盘权限 / 联调
Forge / Vibe Coding README / 文档整理
```

### 两级分组

会话可以归档到两级结构：

```text
系统或项目
└── 需求分组
    └── 会话
```

在会话操作菜单中选择 **设置系统和需求分组**：

1. 一级填写系统或项目，例如 `ERP`、`SCM`、`kai-toolbox`。
2. 二级填写具体需求，例如 `纱线询盘`、`福利签收`、`Vibe Coding 优化`。
3. 保存后可按项目进入，再查看该项目下的需求与会话。

项目分组支持整体重命名；需求分组保持在对应项目下。没有归档的会话统一进入“未分组”。

### 搜索、分屏与导出

- 使用会话搜索按别名快速定位历史任务。
- 多选会话后进入多会话分屏，可同时观察或操作多个 Agent 会话。
- 全屏模式隐藏工作台导航，适合专注处理当前任务。
- 炫彩皮肤根据当前引擎显示不同氛围背景，不改变会话行为。
- 会话可导出为 PDF 或 Word，并保留消息中的图片，便于评审与交付。

## 推荐工作流

一个完整的 Vibe Coding 任务可以按以下顺序进行：

1. 启动 Forge，确认前端和后端均可访问。
2. 进入 Vibe Coding，新建会话并选择准确的工作目录。
3. 选择 Agent 和权限模式，先让 Agent 阅读项目约束与相关代码。
4. 发送需求、截图、日志或 PRD，要求先复述目标和验收标准。
5. 在会话中切换模型或 Agent，获得实现与复核两个视角。
6. 允许 Agent 修改代码并执行类型检查、测试或构建。
7. 查看 diff，确认没有混入其他会话的未提交改动。
8. 提交并推送后，为会话设置别名和两级分组，便于后续继续。

## 开发与验证

需要手工分开启动时：

```powershell
# 后端
mvn -pl toolbox-starter -am spring-boot:run

# 前端
Set-Location frontend
npm install
npm run dev
```

常用验证命令：

```powershell
# 前端类型检查
Set-Location frontend
npm run typecheck

# 前端生产构建
npm run build

# 回到仓库根目录构建全部后端模块
Set-Location ..
mvn clean install
```

项目采用 Java 21、Spring Boot 3.4、Maven 多模块、React 19、Vite 6、Tailwind v4 和 SQLite。运行数据默认保存在 `${user.home}/.kai-toolbox/toolbox.db`。

## 其他模块

Forge 还包含磁盘分析、PRD 澄清、文档处理、媒体工具、项目工作台、业务开发工作台等模块。各模块的安装、配置与使用方式将在后续 README 或独立文档中补充。

架构设计参见：[`docs/design/architecture.md`](docs/design/architecture.md)。
