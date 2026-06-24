import { Link } from 'react-router-dom'
import {
  ArrowLeft, BotMessageSquare, Layers, Radio, ShieldCheck, LifeBuoy, Boxes, Network,
  Cpu, Database, Server, Repeat, Workflow, Plug, SplitSquareHorizontal, KeyRound, Gauge, Code2,
  FolderTree, FileJson, ScanSearch, BookOpen, FolderGit2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Section, HFlow, VFlow, InfoCard, DecisionCard, GuardCard, CodeBlock, type Decision } from '../components/arch-ui'
import { TechArchitectureMap, type TechArchitectureMapProps } from '../components/TechArchitectureMap'
import { StakeholderArchitectureViews, type StakeholderArchitectureViewsProps } from '../components/StakeholderArchitectureViews'

type Snippet = { title: string; lang: string; code: string }

const implBlocks: Snippet[] = [
  {
    title: 'WS②：单连接多路复用 + 按 sessionId 路由（Java · SidecarClient）',
    lang: 'Java',
    code: [
      'class SidecarClient {                          // Java→Node 的 WS 客户端：全局单例',
      '  WebSocketSession session;                    // 一条 WS 连所有会话（多路复用：省连接/重连成本）',
      '  BiConsumer<String,JsonNode> listener;        // sidecar 事件回调 (sessionId, event)，由 Service 注册',
      '',
      '  // 幂等连接：已连直接返回；未连则建连，失败按 deadline 退避重试',
      '  synchronized void ensureConnected() {',
      '    if (session != null && session.isOpen()) return;',
      '    // sidecar 仅绑 127.0.0.1（不对外）；端口来自 ClaudeChatProperties，默认 18890',
      '    session = client.execute(new Handler(), "ws://127.0.0.1:18890").get();',
      '  }',
      '',
      '  // 发出去的消息一律带 type + sessionId —— sidecar 据此路由到对应会话',
      '  void userMessage(String sid, String text){',
      '    send(Map.of("type","user", "sessionId",sid, "text",text));',
      '  }',
      '  void oneShot(String sid, String sys, String usr){   // 一次性无状态任务（供产品内 AI 复用）',
      '    send(Map.of("type","oneShot", "sessionId",sid, "systemPrompt",sys, "userPrompt",usr));',
      '  }',
      '',
      '  // 收：单连接上混着所有会话的事件，必须按 sessionId 拆开',
      '  void onMessage(String json){',
      '    JsonNode n = mapper.readTree(json);',
      '    // 关键：用事件里的 sessionId 分发——这就是“单连接多路复用”的落点',
      '    listener.accept(n.path("sessionId").asText(null), n);',
      '  }',
      '}',
    ].join('\n'),
  },
  {
    title: 'sidecar：query() 异步事件流 + 翻译为约定事件（Node · SessionManager）',
    lang: 'TypeScript',
    code: [
      '// sidecar 跑 Claude Agent SDK；query() 返回一个【异步迭代器】，逐事件 emit 回 Java',
      'async runTurn(text, systemPrompt) {',
      '  const q = query({ prompt: text, options: {',
      '    cwd, model,',
      '    resume: this.sdkSessionId,             // 有 sdkSessionId 就续接上下文（跨重启/续聊）',
      '    permissionMode,                         // 四档权限：default/acceptEdits/plan/bypassPermissions',
      '    canUseTool: this.perms.canUseTool,      // 工具执行前的权限回调（见下一块）',
      '    includePartialMessages: true,           // 打开后才有逐 token 的 stream_event',
      '    systemPrompt,                           // 仅 oneShot 传：作为真正的 system（替换默认）',
      '  }})',
      '  for await (const m of q) this.handle(m)   // 迭代事件流，每条翻译后推给 Java（不阻塞写流）',
      '}',
      '',
      '// 把 SDK 原生事件翻译成与 Java 约定的精简事件',
      'handle(m) {',
      "  // system/init：拿到 SDK 会话号，存起来当“长期记忆句柄”",
      "  if (m.type === 'system' && m.subtype === 'init') this.sdkSessionId = m.session_id",
      "  // 逐 token 文本增量 → assistantDelta（前端据此逐字渲染）",
      "  if (m.type === 'stream_event') emit({ type:'assistantDelta', text: deltaText(m) })",
      "  // 本轮结束 → result（带停止原因/用量）",
      "  if (m.type === 'result')       emit({ type:'result', stopReason: m.subtype })",
      '}',
    ].join('\n'),
  },
  {
    title: '工具权限：挂起 Promise，等前端决策回灌才放行（Node · Permissions）',
    lang: 'TypeScript',
    code: [
      '// Claude 要用危险工具(改文件/跑命令)前，SDK 调 canUseTool；',
      '// 这里返回一个【一直不 resolve 的 Promise】——Promise 不决议，Claude 就卡住等',
      'canUseTool = (tool, input) => new Promise(resolve => {',
      '  const reqId = uuid()',
      '  this.pending.set(reqId, resolve)                 // 把 resolve 暂存起来（挂起）',
      "  emit({ type:'permissionRequest', reqId, toolName: tool, input })  // 经 Java 推前端弹框",
      '})',
      '',
      '// Java 把用户在前端点的“允许/拒绝”回灌进来 → 找到挂起的 Promise 并 resolve',
      'decide(reqId, decision) {',
      '  this.pending.get(reqId)?.({ behavior: decision.behavior })  // resolve 的那一刻，Claude 才继续',
      '  this.pending.delete(reqId)',
      '}',
      '// 本质：一次“等用户决策”= 跨【前端↔Java↔sidecar】三进程、靠 reqId 配对的挂起 Promise',
    ].join('\n'),
  },
  {
    title: 'Java：事件分发 + 单调 seq 广播多端（ClaudeChatService）',
    lang: 'Java',
    code: [
      '// SidecarClient 收到的每条事件都进这里（@PostConstruct 时 setListener 注册）',
      'void onSidecarEvent(String sid, JsonNode node){',
      '  if (sid == null)               { onSidecarDown(); return; }   // sessionId 为 null = 连接级事件(sidecar 断)',
      '  if (sid.startsWith("oneshot:")){ agentOneShot.handle(sid,node); return; } // 一次性任务分流给另一条路',
      '  SessionCtx ctx = sessions.get(sid);                            // 普通会话：找运行时上下文',
      '  switch (node.path("type").asText()){',
      '    // 每条事件配一个会话内单调递增 seq，再广播给所有在看的连接(viewers) + 存进环形缓冲',
      '    case "assistantDelta"   -> broadcast(ctx, nextSeq(ctx), node);',
      '    case "result"           -> broadcast(ctx, nextSeq(ctx), node);',
      '    // 注意：不阻塞！只登记待决策 + 挂超时兜底(到点自动 deny) + 推通知；真正“等”在 sidecar 的挂起 Promise',
      '    case "permissionRequest"-> { broadcast(ctx, nextSeq(ctx), node); onPermissionPending(ctx, node); }',
      '  }',
      '}',
      '',
      '// 决策从另一条消息路径【异步】回来：前端点“允许/拒绝” → decision → 回灌 sidecar → resolve 挂起 Promise',
      'void decision(SessionCtx ctx, String reqId, String behavior){',
      '  sidecar.decision(ctx.id, reqId, behavior);                   // 转给 sidecar，Claude 才继续往下跑',
      '  broadcast(ctx, nextSeq(ctx), decisionResolved(reqId));       // 广播：让其它在看的端关掉同一个弹框',
      '}',
      '// seq 的意义：断线重连按 seq 回放(不漏) + 客户端按 seq 去重(不重)；未决权限弹窗也随回放重投',
    ].join('\n'),
  },
  {
    title: 'WS② 断线自愈：CAS 去重后台重连 + sdkSessionId resume（ClaudeChatService）',
    lang: 'Java',
    code: [
      '// sidecar 进程崩/被杀：先止血，再后台自愈',
      'void onSidecarDown(){',
      '  // 把正在跑的会话标记中断，并通知前端“正在自动重连”',
      '  sessions.values().forEach(c -> { c.status = INTERRUPTED; notify(c, "SIDECAR_DOWN"); });',
      '  if (!recovering.compareAndSet(false, true)) return;  // CAS 去重：断开可能触发多次，只允许一个重连循环',
      '  Thread.ofVirtual().start(() -> {                     // 虚拟线程跑后台重连，不占平台线程',
      '    try {',
      '      for (int i = 0; i < 20; i++) try {               // 最多重试 20 次',
      '        processRegistry.ensureStarted();               // 进程没了就重新拉起 node sidecar',
      '        sidecar.ensureConnected();                     // 重连 WS②',
      '        resumeAllSessions(); return;                   // 成功 → 恢复所有会话后退出循环',
      '      } catch (IOException e){ sleep(1500); }          // 连不上等 1.5s 再试',
      '    } finally { recovering.set(false); }               // 释放去重锁',
      '  });',
      '}',
      '',
      '// 在新 sidecar 上把每个会话“接回来”——靠持久化的 sdkSessionId 续接对话上下文',
      'void resumeAllSessions(){',
      '  for (SessionCtx c : sessions.values())',
      '    if (c.sdkSessionId != null) {',
      '      sidecar.resumeSession(c.id, c.sdkSessionId, c.cwd); // SDK 从磁盘 transcript 还原上下文',
      '      c.status = IDLE; notify(c, "Ready");               // 通知前端清错、恢复可用',
      '    }',
      '}',
    ].join('\n'),
  },
  {
    title: '浏览器重连：按 seq 回放缓冲，越界给 replayGap（ClaudeChatService.attach）',
    lang: 'Java',
    code: [
      '// 前端 WS 重连后发 attach{sessionId,lastEventSeq}，把“没看到的事件”补回来',
      'void attach(WebSocketSession ws, String sid, long lastEventSeq){',
      '  SessionCtx c = sessions.get(sid);',
      '  if (c == null) c = restoreFromDbAndResume(sid);   // 内存没了(后端重启过) → 从 SQLite 恢复元数据 + resume',
      '  c.viewers.add(ws);                                // 重新登记为“在看的连接”',
      '  if (lastEventSeq < c.buffer.oldestSeq())          // 断太久，要补的事件已被有界环形缓冲淘汰',
      '    send(ws, replayGap());                          //   → 发 replayGap 提示“可能未同步，建议刷新”',
      '  else',
      '    for (Event e : c.buffer.since(lastEventSeq))     // 否则按 seq 回放缺失事件',
      '      send(ws, e);                                   //   （客户端再按 seq 去重，避免重复投递）',
      '}',
    ].join('\n'),
  },
  {
    title: '异步折叠同步：CompletableFuture + 虚拟线程（Java · AgentOneShotService）',
    lang: 'Java',
    code: [
      '// 让产品功能像调普通函数一样用 Agent：把“多次异步 push + 一次完成”折叠成一个同步阻塞调用',
      'String runOnce(String system, String user){',
      '  String id = "oneshot:" + UUID.randomUUID();   // oneshot: 前缀，便于事件分流(见上面 onSidecarEvent)',
      '  Call call = new Call();                        // Call = { StringBuilder text; CompletableFuture<String> future }',
      '  calls.put(id, call);                           // 登记“进行中的调用”',
      '  try {',
      '    sidecar.oneShot(id, system, user);           // 发出去（不阻塞）',
      '    return call.future.get(120, SECONDS);        // 阻塞等结果：虚拟线程 park 挂起，不占 OS 线程；超时兜底',
      '  } finally { calls.remove(id); }                // 无论成功/超时/异常都清理，防泄漏',
      '}',
      '',
      '// sidecar 事件回到这里（在 WS 回调线程上跑）',
      'void handle(String id, JsonNode node){',
      '  Call c = calls.get(id);',
      '  switch (node.path("type").asText()){',
      '    case "assistantDelta" -> c.text.append(node.path("text").asText());      // 来一片拼一片',
      '    case "result"         -> c.future.complete(c.text.toString());           // 完成 → 唤醒 runOnce 的 get()',
      '    case "error"          -> c.future.completeExceptionally(new RuntimeException(msg(node)));',
      '  }',
      '}',
      '// park/complete 用 LockSupport：挂起非自旋(不占 CPU)，complete 时 unpark 精准唤醒',
    ].join('\n'),
  },
  {
    title: '简历优化引擎路由：fast(DeepSeek) / quality(Agent)（ResumeOptimizationService）',
    lang: 'Java',
    code: [
      '// 同一个流式接口，按 engine 走两条引擎；前端零改动，输出契约一致',
      'void optimizeStream(req, SseEmitter emitter){',
      '  if ("quality".equalsIgnoreCase(req.engine())) {        // 高质量 → Claude 编码 Agent（复用 Claude 登录态，不花 key）',
      '    Thread.ofVirtual().start(() -> {                     // 控制器要立刻 return emitter，故另起虚拟线程跑',
      '      agentOneShot.stream(systemPrompt(), render(req), req.model(),',
      '          delta -> send(emitter, "chunk", delta));        // Claude 的 delta 直接当 SSE chunk 推',
      '      send(emitter, "done", null); emitter.complete();',
      '    });',
      '  } else {                                               // 快速 → DeepSeek（Spring AI 的 Reactor Flux）',
      '    fastClient.prompt().system(systemPrompt()).user(render(req))',
      '      .stream().content()                                 // Flux<String>，逐片回调',
      '      .subscribe(c -> send(emitter, "chunk", c),',
      '                 e -> send(emitter, "error", e),           // 出错推 error 事件（前端可提示，不静默卡住）',
      '                 () -> { send(emitter, "done", null); emitter.complete(); });',
      '  }',
      '}',
    ].join('\n'),
  },
]

const apiList = [
  'WS① 浏览器↔Java   /api/claude-chat/ws',
  '  C→S: open · send · decision · setMode · attach{lastEventSeq} · interrupt',
  '  S→C: Ready · AssistantDelta · ToolUse · PermissionRequest · Result · Error   (均带 seq)',
  '',
  'WS② Java↔sidecar   ws://127.0.0.1:18890',
  '  J→N: start · resume · user · decision · oneShot · setMode · interrupt',
  '  N→J: init · assistantDelta · toolUse · permissionRequest · result · error',
  '',
  '简历优化 REST',
  '  POST /api/v1/resume/optimize          同步单段',
  '  POST /api/v1/resume/optimize/stream   SSE 流式（event: chunk / done / error）',
  '  POST /api/v1/resume/optimize/whole    整篇',
  '',
  'MCP（对外暴露给外部 Agent）   http://localhost:18080/sse',
  '  resume_get · resume_list_projects · resume_upsert_project/work/education',
  '  resume_remove_* · resume_update_basics · resume_set_skills',
].join('\n')

const decisions: Decision[] = [
  {
    topic: 'Web 并发模型',
    chosen: { name: 'Spring MVC + Java 21 虚拟线程', reason: '阻塞式简洁写法拿到高并发；虚拟线程 park 时卸载载体 OS 线程，长连接挂起几乎零成本' },
    rejected: [
      { name: 'Spring WebFlux（Reactor）', reason: '本场景无强背压/复杂流编排需求；全链路非阻塞 + 调试断裂 + 响应式驱动的心智与改造成本不划算' },
    ],
  },
  {
    topic: '跨语言桥接',
    chosen: { name: 'Java ⇄ Node sidecar（WebSocket）', reason: 'Claude Agent SDK 是 Node 的，用独立进程承载；Java 经 WS 指挥，进程隔离 + 事件化协议' },
    rejected: [{ name: 'Java 直接调 SDK', reason: 'SDK 无 Java 版；JNI/重写都不现实' }],
  },
  {
    topic: 'sidecar 连接模型',
    chosen: { name: '单 WS 多路复用（按 sessionId 路由）', reason: '连接生命周期 / 重连恢复极简；单用户并发极低，队头阻塞代价可忽略（被串行的只是 KB 级文本帧）' },
    fallback: { name: '每会话独立连接 / HTTP·2 多 stream', reason: '真要高并发隔离时的升档路径' },
  },
  {
    topic: '产品内 AI 写操作粒度',
    chosen: { name: '实体级 + 按 id 幂等（MCP 工具）', reason: '爆炸半径锁死单实体，AI 幻觉只影响它显式要改的那一条；非整份覆盖' },
    rejected: [{ name: '整份覆盖（一个大 save）', reason: 'AI 须每次完美重述全量，一处幻觉即整体静默损坏' }],
  },
  {
    topic: '上下文持久化',
    chosen: { name: 'sdkSessionId + SDK 磁盘 transcript', reason: '记忆下沉磁盘、句柄存 SQLite；sidecar 进程近乎无状态，可随意重启而对话不丢' },
    rejected: [{ name: 'Java 侧自存全量对话', reason: '与 SDK 的会话状态双写易漂移，重复造轮子' }],
  },
]

const moduleResolution: Decision[] = [
  {
    topic: '项目工作台「模块」从哪来',
    chosen: { name: '项目自声明 .kai-modules.json（后端通用读取）', reason: '入口在项目侧：放一个 json 即可声明模块树，平台后端零改动、零项目私货；非标准工程（如老式 Java Web）也通吃' },
    fallback: { name: '按构建标志文件自动识别', reason: '无 .kai-modules.json 时回退：pom.xml / build.gradle / package.json / go.mod… 命中即为模块；标准工程开箱即用' },
    rejected: [
      { name: '把项目结构硬编码进后端', reason: '每来一个非标准工程就要改 Java + 重编译 + 重启；平台被具体项目私货污染' },
    ],
  },
  {
    topic: '模块树的业务语义来源',
    chosen: { name: '知识库（domain-knowledge）当权威源 → 生成 .kai-modules.json', reason: '知识库按 项目→模块→知识点 维护业务树（销售 / 成本 / 库存…），比扫文件系统干净、带业务含义；生成器补上代码路径后落盘' },
    rejected: [
      { name: '后端直连知识库 MCP', reason: '知识库是 stdio MCP + 人工部分视图 + 不存代码路径；后端实时消费三重耦合，且建会话仍缺 cwd' },
    ],
  },
]

const guards: { tag: string; risk: string; guard: string }[] = [
  { tag: '①', risk: '锁屏 / 弱网，浏览器 WS 断', guard: 'AI 仍在服务端跑；重连 attach{seq} → 按 seq 回放缓冲 + 客户端去重' },
  { tag: '②', risk: 'sidecar 进程崩 / 被杀', guard: 'CAS 去重的后台自动重连 + 用 sdkSessionId resume 续接，惰性恢复兜底' },
  { tag: '③', risk: '断连过久，事件被环形缓冲淘汰', guard: 'lastEventSeq 早于最旧 seq → 下发 replayGap 提示，而非静默缺失' },
  { tag: '④', risk: '断线瞬间用户点发送，消息丢', guard: 'pendingSends 队列暂存，重连 attach 后先回放再补发' },
  { tag: '⑤', risk: '工具权限需人确认', guard: 'canUseTool 回调挂起 Promise → 前端决策 → 回灌 resolve（跨三进程）' },
  { tag: '⑥', risk: '同步接口想用异步 Agent', guard: 'CompletableFuture 把事件流折叠为同步阻塞调用，虚拟线程承载等待' },
]

const vibeCodingTechMap: TechArchitectureMapProps = {
  title: 'Vibe Coding 技术架构全景',
  subtitle: '按参考图样式展示移动端、Java 后端、Node sidecar、Claude/Codex、持久化与权限交互的整体调用链。',
  top: ['Mobile Browser', 'React AppShell', 'Spring Boot Backend', 'Node Sidecar'],
  clients: ['Claude Chat UI', 'WS① Browser Client', 'Java SidecarClient', 'WS② Node Client', 'Claude Agent SDK'],
  left: ['会话列表', '实时流式输出', '权限弹窗', '断线重连', '多端围观'],
  right: ['Claude Code', 'Codex CLI', 'MCP Tools', '本地文件系统', 'Shell 命令'],
  groups: [
    { title: '浏览器端', tone: 'orange', nodes: ['useClaudeChatSocket', 'seq 去重', '权限决策 UI', '重连 attach'] },
    { title: 'Java 控制面', tone: 'green', nodes: ['ClaudeChatService', 'SessionCtx', '事件环形缓冲', '虚拟线程等待'] },
    { title: 'Node Agent 面', tone: 'purple', nodes: ['SessionManager', 'query() 事件流', 'canUseTool 挂起', 'sdkSessionId resume'] },
    { title: '持久化与恢复', tone: 'cyan', nodes: ['SQLite 会话表', 'SDK transcript', 'pendingSends', 'CAS 重连守护'] },
  ],
  bottom: ['WebSocket', 'SSE/MCP', 'Virtual Threads', 'Claude SDK', 'SQLite', 'Permission Promise'],
  footer: 'VIBE CODING',
}

const vibeCodingStakeholderViews: StakeholderArchitectureViewsProps = {
  title: '面向不同角色的架构视图',
  summary: '先讲清移动端 AI 编码助手解决什么问题，再把能力、业务闭环和技术下钻层次拆开。',
  capabilities: [
    { title: '移动办公', items: ['手机查看会话', '随时发起任务'] },
    { title: '实时协作', items: ['流式输出', '多端同步'] },
    { title: '安全确认', items: ['危险操作确认', '权限可控'] },
    { title: '任务不中断', items: ['断线恢复', '进程重启续接'] },
    { title: '产品内 AI', items: ['一次性任务', '工具能力复用'] },
    { title: '上下文保留', items: ['会话可续', '历史可追'] },
  ],
  value: {
    center: '移动端 AI 编码助手',
    top: '研发响应更快',
    left: '远程处理更方便',
    right: 'AI 操作更可控',
    bottom: '任务中断风险下降',
  },
  business: {
    actors: ['开发者', '代码仓库', 'AI Agent'],
    platform: 'Vibe Coding',
    capabilities: ['实时对话', '权限确认', '任务恢复'],
    outcomes: ['提高研发效率', '减少等待', '降低误操作风险'],
  },
  layers: [
    { title: '用户应用层', items: ['移动端聊天', '权限弹窗', '会话列表'] },
    { title: '平台能力层', items: ['事件流', '会话管理', '断线恢复', '多端同步'] },
    { title: 'Agent 执行层', items: ['编码 Agent', '工具调用', '上下文续接', '本地工作区'] },
  ],
  c4: [
    { level: 'Context', audience: '领导 / 老板', items: ['开发者', 'AI 编码助手', '代码仓库'] },
    { level: 'Container', audience: '总监 / 架构师', items: ['React 前端', 'Java 后端', 'Node 边车', 'AI Agent'] },
    { level: 'Component', audience: '开发', items: ['会话服务', '事件缓冲', '权限网关', '恢复机制'] },
    { level: 'Code', audience: '程序员', items: ['ClaudeChatService', 'SidecarClient', 'SessionManager'] },
  ],
  chain: [
    { layer: '用户 / 业务入口', color: 'blue', items: ['开发者手机', '平板', '浏览器'], note: '随时随地编码' },
    { layer: '前端展示层', color: 'blue', items: ['React 聊天界面', '权限确认弹窗', '会话列表', '流式输出渲染'] },
    { layer: 'API / WebSocket 层', color: 'violet', items: ['Spring Boot REST', 'WS①（前端↔Java）', 'SSE 降级备选', '鉴权 JWT'] },
    { layer: '会话编排层', color: 'violet', items: ['ClaudeChatService', '会话状态机', '断线恢复 resume', '事件缓冲区'] },
    { layer: 'AI Agent 层', color: 'orange', items: ['WS②（Java↔Node sidecar）', 'Node SessionManager', 'Claude SDK query()', '工具权限回调'] },
    { layer: 'Agent 工具执行层', color: 'emerald', items: ['read/write/bash 工具', '本地代码仓库', '工作目录 cwd', 'canUseTool 权限门禁'] },
    { layer: '数据持久层', color: 'rose', items: ['SQLite · 会话记录', 'SDK sessionId（续接）', '项目工作目录映射'] },
    { layer: '可观测性层', color: 'slate', items: ['SSE 阶段推送', '工具调用日志', 'LLM 监控（toolbox-llm）'] },
  ],
  deps: [
    {
      category: 'AI 模型 / SDK', color: 'orange',
      items: [
        { name: 'Claude Agent SDK（Node.js）', note: 'Anthropic 官方，query() 驱动 Agent loop' },
        { name: 'Codex CLI（可选）', note: 'OpenAI 编码 Agent，同 sidecar 接口接入' },
      ],
    },
    {
      category: '协议 / 传输', color: 'violet',
      items: [
        { name: 'WebSocket（双向）', note: 'WS① 前端↔Java / WS② Java↔sidecar，单连接多路复用' },
        { name: 'SSE（降级）', note: 'WS 不可用时备选单向推送' },
      ],
    },
    {
      category: '数据库', color: 'rose',
      items: [{ name: 'SQLite（本地）', note: '会话记录、工作目录映射，WAL 模式' }],
    },
  ],
}

export function VibeCodingArch() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      {/* 标题 */}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="h-6 w-6 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-bold tracking-tight">Vibe Coding · 架构与实现</h1>
            <Badge variant="secondary">实现原理</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/tools/architecture" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <ArrowLeft className="h-3.5 w-3.5" /> 返回合集
            </Link>
            <Link to="/tools/claude-chat" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <BotMessageSquare className="h-3.5 w-3.5" /> 去使用
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          把 <b className="text-[var(--color-foreground)]">Claude Code / Codex 编码 Agent</b> 封装成移动端可用的实时编码助手，并把 Agent 能力下沉为产品内 AI 功能。
          技术栈 <b className="text-[var(--color-foreground)]">Java 21（虚拟线程）+ Spring Boot 多模块 + Node sidecar(Claude Agent SDK) + React 19</b>。
          核心难点：把「异步 / 长连接 / 有状态 / 含人机交互」的 Agent 工业级桥接到 Web，并在弱网 / 进程崩溃下保证会话不丢、多端一致。
        </p>
      </header>

      <StakeholderArchitectureViews {...vibeCodingStakeholderViews} />

      <TechArchitectureMap {...vibeCodingTechMap} />

      {/* 整体架构 */}
      <Section icon={Layers} title="整体架构（三层 + 两条 WebSocket）" subtitle="Java 自己不跑 AI——真正调 Claude 的是独立 Node 进程；Java 经 WS 指挥它">
        <Card>
          <CardContent className="p-4">
            <VFlow
              steps={[
                { icon: Network, title: '手机 / 浏览器 · React', desc: 'useClaudeChatSocket（重连 / 回放）', tone: 'primary' },
                { icon: Server, title: 'Java 后端 · ClaudeChatService', desc: 'WS① 会话状态机 + 事件环形缓冲 + viewers + SidecarClient(单连接·按 sessionId 路由)' },
                { icon: Workflow, title: 'Node sidecar · SessionManager', desc: 'WS② 跑 Claude Agent SDK 的 query() 异步事件流' },
                { icon: Cpu, title: 'Claude / Codex', desc: '底层模型；上下文落 SDK 磁盘 transcript', tone: 'accent' },
              ]}
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <InfoCard icon={Plug} title="WS① 浏览器↔Java" detail="你点的、你看的" />
              <InfoCard icon={Plug} title="WS② Java↔sidecar" detail="仅 127.0.0.1，单连接多路复用" />
              <InfoCard icon={Database} title="SQLite" detail="会话元数据 + sdkSessionId（句柄）" />
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* 项目工作台：从项目到模块到会话 */}
      <Section icon={FolderTree} title="项目工作台（选模块进场建会话）" subtitle="对话之前先定位「在哪个模块里干活」——扫项目 → 识别模块 → 选模块当 cwd → 开 Vibe Coding 会话">
        <Card>
          <CardContent className="space-y-3 p-4">
            <VFlow
              steps={[
                { icon: FolderGit2, title: '扫配置根下的项目', desc: 'workspace.roots 一级子目录；安全边界限制不越界扫盘', tone: 'primary' },
                { icon: ScanSearch, title: '识别项目内的模块', desc: '优先读项目自声明，否则按构建标志文件自动识别' },
                { icon: BotMessageSquare, title: '选中模块 → 以其目录为 cwd 开会话', desc: '模块绝对路径即 Agent 工作目录；已有会话则直接接回', tone: 'accent' },
              ]}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <InfoCard icon={FileJson} title=".kai-modules.json（自声明）" detail="项目根放一份模块树；后端通用解析，路径越界校验" />
              <InfoCard icon={ScanSearch} title="构建文件自动识别（回退）" detail="pom.xml / gradle / package.json / go.mod / Cargo.toml…" />
              <InfoCard icon={BookOpen} title="知识库生成模块树" detail="domain-knowledge 当权威源，生成器补代码路径后落盘" />
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              入口刻意放在<b className="text-[var(--color-foreground)]">项目侧</b>：标准工程靠构建文件开箱即用；非标准工程（如老式 Java Web）放一份 <code>.kai-modules.json</code> 即可，
              <b className="text-[var(--color-foreground)]">平台后端零改动、不被任何具体项目私货污染</b>。
            </p>
          </CardContent>
        </Card>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {moduleResolution.map(d => <DecisionCard key={d.topic} d={d} />)}
        </div>
      </Section>

      {/* 流式 + 权限交互 */}
      <Section icon={Radio} title="流式输出 + 工具权限交互" subtitle="模型吐字 → sidecar 翻译 → Java 转发 → 浏览器追加，三跳全程流式；权限是跨三进程的挂起 Promise">
        <Card>
          <CardContent className="space-y-3 p-4">
            <HFlow
              steps={[
                { icon: Cpu, title: 'Claude 吐 token' },
                { icon: Workflow, title: 'sidecar 事件化 assistantDelta', tone: 'muted' },
                { icon: Server, title: 'Java 原样转发' },
                { icon: Network, title: '前端逐字追加', tone: 'primary' },
              ]}
            />
            <HFlow
              steps={[
                { icon: ShieldCheck, title: 'Claude 要用危险工具' },
                { icon: ShieldCheck, title: 'canUseTool 挂起 Promise → permissionRequest', tone: 'primary' },
                { icon: Network, title: '前端弹框，用户决策' },
                { icon: Repeat, title: 'decision 回灌 → resolve 放行', tone: 'accent' },
              ]}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              「等用户决策」= 一个跨三进程、靠 reqId 配对的<b className="text-[var(--color-foreground)]">挂起 Promise</b>；你点同意那一刻才 resolve、Claude 才继续。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 双链路断线恢复 */}
      <Section icon={LifeBuoy} title="双链路断线韧性（可用性核心）" subtitle="两条 WS 是两个独立失效域，恢复路径互不替代">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Plug className="h-4 w-4 text-[var(--color-primary)]" /> WS① 浏览器断（便宜）</div>
              <VFlow steps={[
                { title: 'AI 仍在服务端跑，只是没人看', tone: 'muted' },
                { title: '前端重连 → attach{lastEventSeq}' },
                { title: 'seq 有序回放 + 客户端去重 + replayGap 兜底 + pendingSends 补发', tone: 'accent' },
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-[var(--color-destructive)]" /> WS② sidecar 崩（难点）</div>
              <VFlow steps={[
                { title: '会话置 INTERRUPTED + emit SIDECAR_DOWN', tone: 'danger' },
                { title: 'onSidecarDown：CAS 去重，起后台重连循环' },
                { title: 'ensureStarted 重拉进程 + ensureConnected 重连' },
                { title: '用 sdkSessionId resume 续接上下文', tone: 'accent' },
              ]} />
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* 跨进程不丢上下文 + 异步折叠同步 */}
      <Section icon={KeyRound} title="跨进程不丢上下文 + 异步折叠为同步" subtitle="身份解耦让 sidecar 可随意重启；Future + 虚拟线程让产品功能像调普通函数一样用 Agent">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard icon={Network} title="sessionId（短期路由身份）" detail="当前运行中，浏览器↔Java↔sidecar 三方路由用" />
          <InfoCard icon={KeyRound} title="sdkSessionId（长期记忆句柄）" detail="跨重启续接；真实对话上下文落在 SDK 磁盘 transcript" />
        </div>
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-medium">一次性 headless：把异步事件流「折叠」成同步阻塞调用</div>
            <HFlow steps={[
              { title: 'oneShot{requestId, system, user}' },
              { icon: Gauge, title: '虚拟线程 future.get() park 挂起', desc: '不占 OS 线程', tone: 'primary' },
              { title: 'WS 回调累积 delta，result 时 future.complete' },
              { title: 'unpark 唤醒 → 返回全文', tone: 'accent' },
            ]} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              park 非自旋（<code>LockSupport.park</code>，睡死不占 CPU）；虚拟线程 park 时卸载载体 OS 线程，几十个并发等待也不吃 OS 线程——所以敢写成「同步阻塞」。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 多路复用权衡 */}
      <Section icon={SplitSquareHorizontal} title="单连接多路复用 + 队头阻塞权衡" subtitle="一条 WS② 承载所有会话，按 sessionId 路由">
        <Card>
          <CardContent className="space-y-2 p-4">
            <HFlow steps={[
              { icon: Boxes, title: '会话 1 / 2 / N', desc: '各自的事件' },
              { icon: Plug, title: '单 WS② 连接（按 sessionId 复用）', tone: 'primary' },
              { icon: Workflow, title: 'sidecar 按 sessionId 分发' },
            ]} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              取舍：单连接有队头阻塞，但<b className="text-[var(--color-foreground)]">被串行的只是 KB 级文本帧</b>，真正耗时的 LLM 生成是事件循环上的独立异步流、<b className="text-[var(--color-foreground)]">并发不受影响</b>；单用户并发极低 → 用可忽略代价换连接 / 重连的极简。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 选型决策 */}
      <Section icon={Boxes} title="关键技术选型与取舍" subtitle="每个决策列出 ✓ 选用 · 降级备选 · ✗ 被筛除（置灰 + 原因）">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {decisions.map(d => <DecisionCard key={d.topic} d={d} />)}
        </div>
      </Section>

      {/* 健壮性清单 */}
      <Section icon={ShieldCheck} title="健壮性（抗造）清单 → 落点" subtitle="弱网 / 崩溃 / 人机交互下的边界，光跑 demo 看不出来">
        <div className="grid gap-3 sm:grid-cols-2">
          {guards.map(g => <GuardCard key={g.tag} {...g} />)}
        </div>
      </Section>

      {/* 代码实现简化版 + API */}
      <Section icon={Code2} title="代码实现简化版（每块逻辑 + API）" subtitle="精简示意 + 逐行注释；右上角可一键复制。面试可对着讲清每块怎么实现">
        <div className="space-y-3">
          {implBlocks.map(b => <CodeBlock key={b.title} {...b} />)}
          <CodeBlock title="API 清单（WS 消息 / REST / MCP）" lang="API" code={apiList} />
        </div>
      </Section>
    </div>
  )
}
