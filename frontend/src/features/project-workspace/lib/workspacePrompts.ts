import type { ProjectModule } from '@/features/claude-chat/public-api'

/**
 * 新建模块会话时的「编码范围前言」：把本模块的前端/后端目录带进提示词约束改动范围。
 * 有 codePath 或 webPath 才生成；末尾留「需求：」让用户接着写。无范围信息则返回空串（不预填）。
 */
export function buildModuleScopePrompt(module: ProjectModule): string {
  const web = (module.webPath ?? '').trim()
  const code = (module.codePath ?? '').trim()
  if (!web && !code) return ''
  const lines = [`【本次工作模块：${module.name}】`]
  if (module.summary?.trim()) lines.push(module.summary.trim())
  lines.push('改动请优先落在本模块目录内：')
  if (web) lines.push(`- 前端：${web}`)
  if (code) lines.push(`- 后端：${code}`)
  lines.push('若确实需要改动这两个目录之外的类（如公共库 / 共享 / 跨模块的类），先列出涉及了哪些外部类及原因，我确认后再改——不要擅自扩大范围，也不必因此卡住。')
  lines.push('', '需求：')
  return lines.join('\n')
}

/**
 * 「按菜单识别模块」投喂给 Claude 会话的提示：agent 从菜单权威来源（数据库动态菜单优先查库，否则读路由/配置/初始化 SQL）
 * 识别业务模块，经 domain-knowledge 的 add-modules 落盘。刻意先预览、owner 确认后再 --apply，
 * 守住「内容 agent 产、脚本只确定性落盘」的红线。
 */
export function buildMenuSyncPrompt(project: string, projectPath: string, kbRepo: string): string {
  const knowledgeRepo = kbRepo || '<project-domain-knowledge 仓根>'
  const modulesFile = `knowledge/${project}/impl/modules.json`
  const isYoooni = project.toLowerCase() === 'yoooni'
  const projectSpecificRules = isYoooni
    ? `
Yoooni 专属数据库菜单规则：

1. 已知权威菜单表为 CRM_RIGHT，但仍须先通过只读查询核实表结构、样本和项目真实菜单 SQL。
2. 关键字段：ID=菜单节点 ID、CODE=真实菜单名称、MODELNAME=父菜单 ID、LEVELS=层级、STATUS=启停状态、NOTES=平台类型、TYPEID=菜单/权限类型、URL=页面地址。
3. 桌面 ERP 菜单核心条件必须以项目真实 SQL 为准，并重点核实：
   NOTES = 'menu' AND STATUS = 0 AND TYPEID = 0
4. 手机、平板、SCM、SCM APP 等平台须分别结合项目真实查询逻辑判断，禁止把 CRM_RIGHT 全表无条件登记。
5. 启用的 LEVELS=1 根菜单作为一级业务模块；其余真实菜单按 MODELNAME 递归放入 children。
6. URL='a' 或空 URL 的叶子通常是按钮/权限，不登记；若存在真实菜单后代，仅作为分组节点保留。
7. 页面标题与 CODE 不同时，name 保存 CODE，aliases 保存页面真实标题或 owner 确认的叫法。
8. 重点核对“产品研发”下完整页面清单，以及“开发详情看板(新)”能否定位到 menuId=704027。`
    : `
其他项目兼容规则：

1. 不得套用 Yoooni 的 CRM_RIGHT 字段、LEVELS=1、NOTES/TYPEID/STATUS 条件。
2. 动态菜单项目必须先查表结构、样本数据和项目真实菜单 SQL，确认名称、ID、父子、层级、平台、启停、节点类型和 URL 字段。
3. 静态菜单项目以路由表、FeatureManifest、菜单配置或初始化文件为权威来源。
4. 动静态并存时，数据库决定运行时菜单名称、层级和启停；代码补充路径、路由与页面标题别名。
5. 依据该项目真实根节点条件生成一级模块，并按真实父子字段递归生成 children。`

  return `我要更新知识库中「${project}」项目的模块与页面菜单索引。

知识库仓：
${knowledgeRepo}

目标项目：
${projectPath}

目标文件：
${modulesFile}

目标不是只登记一级模块，也不是把每个菜单页面平铺成一级模块，而是生成：

一级业务模块 modules
  └─ 递归页面菜单 children
       └─ 必要时继续递归 children

务必保留 owner 确认关卡：先调查、识别、生成完整候选和预览；owner 明确回复“--apply”之前禁止写盘。

一、确认菜单来源

1. 先判断项目属于数据库动态菜单、代码/文件静态菜单，还是两者并存。
2. 数据库动态菜单是名称、父子层级、启停状态和平台归属的权威来源；代码只补充路径、路由和页面标题别名。
3. 只允许 SELECT/WITH，禁止 DDL/DML；不得输出密码、Token、连接串或其他凭据。
4. 查询前必须核实表结构、样本和项目真实菜单查询逻辑，禁止仅凭字段名或经验猜测。
${projectSpecificRules}

二、模块和页面判定

1. 权威菜单源中的有效根业务菜单登记为一级 modules。
2. 根菜单下的真实菜单节点按父子关系递归放入 children；children 不计入一级模块数量。
3. 不得把每个菜单页面平铺成一级模块。
4. 排除新增、修改、删除、保存、提交、审核、作废、打印、字段权限和操作权限。
5. 空 URL 或占位 URL 的叶子节点不得仅凭节点标记登记；若有真实菜单后代，只保留为分组节点。
6. 同一 URL 对应多个菜单入口时保留全部菜单链，不按 URL 去重。
7. 数据库菜单名与页面标题不同时，name 保存权威菜单名，aliases 保存页面标题或 owner 确认叫法。
8. codePath/webPath/webPaths 只能根据 URL、Action、路由配置、JSP 或前端目录核实后填写。
9. 路径必须相对项目根，并用 Test-Path 或等价方式验证；无法确认时留空，禁止硬编。
10. 不得只扫源码目录判断业务模块，不得把 common、dao、model、util 等纯技术目录登记为模块。

识别公式：
业务模块树 = 有效根业务菜单 + 递归真实菜单容器 + 递归真实页面入口 + 经代码验证的独立业务实现 - 按钮/操作权限 - 停用节点 - 纯技术目录

三、JSON 结构

一级模块：
{
  "key": "英文稳定标识",
  "name": "权威一级菜单名",
  "codePath": "后端主目录；不确定可省略",
  "webPath": "前端主目录；不确定可省略",
  "webPaths": ["存在多个前端目录时使用"],
  "children": []
}

页面菜单节点：
{
  "key": "menu-{权威菜单ID}",
  "menuId": 704027,
  "name": "权威菜单名",
  "aliases": ["页面实际标题"],
  "url": "完整菜单 URL，保留必要参数",
  "codePath": "后端目录；不确定可省略",
  "webPath": "前端目录；不确定可省略",
  "children": []
}

要求：
- 菜单节点 key 优先使用 menu-{菜单ID}，保证同 URL 多入口不冲突。
- 分组节点允许没有 URL，但必须有真实菜单 children。
- 不创建空字符串占位字段；不确定字段可省略并进入缺字段报告。

四、历史数据校验

开始生成候选前读取 ${modulesFile}，把权威根菜单与现有一级 modules 按名称和证据对比，单列：

- 数据库/权威源新增一级模块；
- 现有但权威源不存在的一级模块；
- key 与知识点 module 不一致；
- 需要迁移的知识点；
- name、路径或菜单树待修正的已有条目；
- 可能导致一级模块数量变化的冲突。

add-modules 只新增节点、补空字段、按 key 去重，不覆盖既有有效值。已有错误值不得伪装成“去重跳过”，必须列出旧值、新值、证据和迁移建议，等待 owner 决策。不得擅自保留历史非权威模块导致一级模块数量异常。

五、预览确认

先把完整候选树写入 UTF-8 临时候选 JSON，仅执行预览：

cd ${knowledgeRepo}
node scripts/bootstrap.mjs add-modules --project ${project} --from <候选JSON文件>

禁止添加 --apply。

预览必须汇总：

- 权威源一级模块数量；
- 最终一级模块数量；
- 下级菜单节点数量；
- 实际页面数量；
- 新增一级模块和新增菜单节点；
- 补齐字段和去重跳过；
- 缺 key/name；
- 有 URL 但缺 codePath/webPath 的数量；
- 排除的按钮/权限数量；
- 历史模块冲突和建议迁移方案；
- 代表性一级菜单的完整递归页面清单。
${isYoooni ? '- “产品研发”下识别出的完整页面清单。' : ''}

预览后立即停止。只有 owner 明确回复“--apply”，才能继续；“继续”“可以”“更新一下”“补全”均不能替代。

六、落盘与校验

owner 明确回复“--apply”后：

1. 先按 owner 已确认方案处理历史模块迁移；未经确认不得覆盖或删除。
2. 对完全相同的候选文件执行：
   node scripts/bootstrap.mjs add-modules --project ${project} --from <同一候选JSON文件> --apply
3. 重新读取 modules.json，核对一级模块数、递归节点数和关键页面。
4. 执行 node scripts/bootstrap.mjs check，要求问题数为 0。
5. 执行：
   node scripts/bootstrap.mjs check-paths --project ${project} --backend-root ${projectPath} --frontend-root ${projectPath}
6. 执行 npm run build、npm run catalog、npm run smoke。

七、MCP 菜单定位能力验收

1. 先检查源码和构建产物是否已有独立 locate_menu，禁止重复实现。
2. locate_menu 应支持菜单名称、aliases、完整菜单链、URL、project/module 限定和 limit。
3. 返回至少包含 project、module key、一级模块中文名、menuId、数据库菜单名、aliases、menuPath、URL、codePath、webPath/webPaths 和匹配分数。
4. search_knowledge 继续只负责业务知识检索，不得改变原语义。
5. 若现有 locate_menu 已满足要求，只做验证；若缺能力，先报告差异，取得 owner 对代码变更的确认后再修改 MCP 源码。
6. reload_knowledge 只刷新知识数据缓存；新增或修改 MCP 工具定义后必须重新构建并重启 MCP 子进程/sidecar。
7. Forge 咨询模式只开放只读 locate_menu，不开放 reload_knowledge；同步核对 Codex 和 Claude 的知识工具白名单。
8. 最终用全新 stdio MCP 连接验证工具列表和查询结果。reload 应返回知识点数和菜单数。
${isYoooni ? '9. 验证“开发详情看板(新)”能够定位到 menuId=704027。' : ''}

红线：

- 权威菜单源决定模块名称、层级、平台和启停，代码只补路径与别名。
- 一级 modules 与递归 children 必须分层统计。
- 不把按钮权限当页面，不把页面平铺成一级模块。
- 不按 URL 去重丢失不同菜单入口。
- 不让 bootstrap 脚本自行从源码抽取业务内容。
- 不绕过 owner 确认直接 --apply。
- 不把 Yoooni 的数据库字段和过滤条件套到其他项目。`
}

