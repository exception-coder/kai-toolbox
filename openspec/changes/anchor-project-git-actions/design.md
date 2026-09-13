## Context

项目身份由 RegistryProject.id 唯一确定。当前 ProjectGitWorkspace 接收 projects 并二次选择；ProjectRegistryPage 把整个项目行实现为 Link。yoooni-one 采用 AGENTS 总路由、docs/ai-coding-architecture 六层结构、frontend-component-conventions 交互契约及 forge-enterprise 画像绑定。本项目已有相同六层规范，但没有集中的产品交互哲学。

## Goals / Non-Goals

目标为围绕主对象降低导航成本并建立项目内可执行原则。不是禁止页签或强制所有任务弹框；不改 push 的安全快照、不实际向远端推送、不修改其他项目规范。

## Decisions

适用原则：OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、AI-01、EVID-01、CTRL-01。推送期间暂时禁止关闭是 CTX-01 的明确例外，用可见等待提示解释；请求完成或失败后恢复关闭。

CONSERVATIVE 模式：项目行改为 article，详情 Link 与 Git 按钮为兄弟，禁止嵌套交互。每行 ProjectGitDialog 绑定同一个 project.id；打开时才挂载数据面板，保留查询 key 与推送实现，不复制服务。Radix Dialog 提供焦点圈定、背景不可交互和关闭回焦；标题含项目名及路径，桌面限宽、窄屏适配，内容独立滚动。

推送期间按钮防重、保留结果上下文，阻止关闭并明确提示；完成或失败后可关闭和重试。查询加载期间允许关闭。旧 section=git 替换为全部项目，不猜测项目，不自动读取或推送第一个项目。原列表搜索/筛选/滚动不因弹框重新挂载。

docs/product-philosophy.md 为项目原则正文，稳定规则 ID、适用范围、反例、例外、验证、来源和演进方式；AGENTS 与 docs/INDEX 只路由。design.config.json 以 reference 引用 forge-enterprise，项目文档为 overrides；不把该候选画像升级成全局强制规则。用户反馈另记录为 local preference evidence。

## Risks / Trade-offs

- Git 文件很多：弹框限高并滚动，待 Commit/Push 仍是同一对象的两种数据视图。
- 关闭期间状态丢失：推送进行中明确禁止关闭；其他状态遵循 Escape、可见关闭和触发器回焦。
- 哲学抽象成口号：每条约束必须附判断表和验收方法，例外在对应 OpenSpec 留证。
- AGENTS 有其他任务未提交修改：只暂存新增路由块，不提交其他内容。

## Evidence and review

Agent 自审通过：作用域为前端与项目文档，无新权限或数据库。Carbon tabs 用于同一上下文的相关内容分类；WAI-ARIA 要求模态焦点圈定和关闭回焦。对象入口优先为本项目明确选择，不伪称通用标准禁止动作页面。

参考：https://carbondesignsystem.com/components/tabs/usage/ 与 https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ 。
